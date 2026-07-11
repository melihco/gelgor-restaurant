"""
Creatomate Brand Bundle Service — ajans kalitesinde marka kiti ile otomatik üretim.

Her içerik fikri için:
  - 2 story (animasyonlu MP4)
  - 1 post  (statik JPG)

Marka tokenlarını doğrudan brand_contexts tablosundan / vibe_profile'dan okur.
Canva Enterprise gerektirmez; template ID'ye gerek yoktur.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_NEXUS_API  = ""  # set from settings
_INT_KEY    = ""  # set from settings


# ── Brand token resolver ──────────────────────────────────────────────────────

@dataclass
class CreatomaBrandTokens:
    accent_color:       str   = "#005f99"
    primary_color:      str   = "#1a2b4a"
    font_family:        str   = "Montserrat"
    heading_personality: str  = "bold_display"
    overlay_opacity:    float = 0.35
    logo_url:           str   = ""
    business_type:      str   = ""
    mood:               str   = "warm natural"
    grading_look:       str   = "golden_hour"


def _safe_json(v: Any) -> dict:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return {}
    return v or {}


def resolve_tokens_from_brand(brand: Any) -> CreatomaBrandTokens:
    """
    Read brand context / vibe profile and return design tokens for Creatomate.
    Precedence: brand_vibe_profile > brand_theme > manual colors > defaults.
    """
    vibe = _safe_json(getattr(brand, "brand_vibe_profile", None))
    theme = _safe_json(getattr(brand, "brand_theme", None))

    # ── Colors ─────────────────────────────────────────────────────────────────
    vibe_palette = vibe.get("palette", {})
    theme_palette = theme.get("palette", {}) if theme else {}

    accent = (
        theme_palette.get("accent")
        or vibe_palette.get("accent")
        or getattr(brand, "brand_accent_color", None)
        or "#005f99"
    )
    primary = (
        theme_palette.get("primary")
        or vibe_palette.get("primary")
        or getattr(brand, "brand_primary_color", None)
        or "#1a2b4a"
    )

    # ── Typography ─────────────────────────────────────────────────────────────
    vibe_typo = vibe.get("typography", {})
    theme_typo = theme.get("typography", {}) if theme else {}

    heading_personality = (
        theme_typo.get("heading_personality")
        or vibe_typo.get("heading_personality")
        or "bold_display"
    )
    font_family = (
        theme_typo.get("heading_font")
        or getattr(brand, "brand_font_family", None)
        or ""
    )
    text_overlay_density = vibe_typo.get("text_overlay_density", "moderate")
    overlay_opacity = 0.28 if text_overlay_density == "minimal" else 0.38

    # ── Grading / mood ─────────────────────────────────────────────────────────
    vibe_grading = vibe.get("grading", {})
    grading_look = (
        vibe_grading.get("look")
        or theme.get("grading", {}).get("look") if theme else None
        or "golden_hour"
    )
    # Map grading look to a mood string for template selection
    mood_map = {
        "golden_hour": "warm natural", "warm golden": "warm natural",
        "cool blue": "cool", "cool moody": "cool",
        "editorial": "sophisticated", "dramatic": "energetic",
        "natural daylight": "clean", "minimal": "clean",
    }
    mood = next((v for k, v in mood_map.items() if k in grading_look.lower()), "warm natural")

    # ── Logo ────────────────────────────────────────────────────────────────────
    logo_url = getattr(brand, "logo_url", "") or ""

    # ── Business type ──────────────────────────────────────────────────────────
    business_type = (
        getattr(brand, "business_type", "")
        or getattr(brand, "industry", "")
        or ""
    )

    return CreatomaBrandTokens(
        accent_color=accent,
        primary_color=primary,
        font_family=font_family,
        heading_personality=heading_personality,
        overlay_opacity=overlay_opacity,
        logo_url=logo_url,
        business_type=business_type,
        mood=mood,
        grading_look=grading_look,
    )


# ── Bundle renderer ────────────────────────────────────────────────────────────

@dataclass
class BundleSlot:
    content_type: str    # 'story' | 'post'
    label: str
    ext: str


BUNDLE_SLOTS: list[BundleSlot] = [
    # Production rule: Creatomate generates STORIES only.
    # Posts → plain photo + caption (no overlay renderer).
    # Reels → Runway handles; Creatomate not needed.
    BundleSlot("story", "Story Lüks",  "mp4"),
    BundleSlot("story", "Story Güçlü", "mp4"),
]


@dataclass
class BundleResult:
    slot:       str
    status:     str
    output_url: str   = ""
    thumb_url:  str   = ""  # JPG thumbnail for video slots
    template_key: str = ""
    brand_font: str   = ""
    error:      str   = ""
    artifact_id: str  = ""


async def _render_slot(
    api_key: str,
    slot: BundleSlot,
    photo_url: str,
    title: str,
    subtitle: str,
    date_badge: str,
    brand_name: str,
    tokens: CreatomaBrandTokens,
    idx: int = 0,
) -> BundleResult:
    from app.services.creatomate_template_service import (
        render_for_brand, select_template_for_brand,
        _get_renderscript, apply_brand_tokens, render_with_template,
        TEMPLATE_DEFINITIONS,
    )
    import copy

    try:
        # Vary story template between slots for visual diversity.
        # Slot 0 = Editorial (photo_bold) — most versatile, bold statement
        # Slot 1 = Luxury Split or Cinematic — different layout, more contrast
        if slot.content_type == "story" and idx == 1:
            mood_lower = (tokens.mood or "").lower()
            if any(x in mood_lower for x in ("sunset", "golden", "beach", "sea", "nature", "atmosphere")):
                tpl_key = "story_cinematic"
            elif any(x in mood_lower for x in ("luxury", "premium", "elegant", "fine")):
                tpl_key = "story_script"
            else:
                tpl_key = "story_cinematic"  # second slot always distinct from first
        else:
            tpl_key = select_template_for_brand(
                slot.content_type,
                tokens.business_type,
                tokens.heading_personality,
                tokens.mood,
            )

        source = _get_renderscript(tpl_key)
        if not source:
            return BundleResult(slot.label, "failed", error=f"No source for {tpl_key}")

        branded = apply_brand_tokens(
            source=source,
            brand_font=tokens.font_family or _resolve_font(tokens.heading_personality),
            primary_color=tokens.primary_color,
            accent_color=tokens.accent_color,
            overlay_opacity=tokens.overlay_opacity,
            logo_url=tokens.logo_url,
        )

        # Register brand-specific template temporarily
        bkey = f"{tpl_key}_brand_{id(branded)}"
        TEMPLATE_DEFINITIONS.append({
            "key": bkey, "name": bkey, "description": "",
            "format": slot.content_type, "preview_label": "", "source": branded,
        })
        try:
            res = await render_with_template(
                api_key=api_key, template_id=f"renderscript:{bkey}",
                photo_url=photo_url, title=title, brand_name=brand_name,
                subtitle=subtitle, date_badge=date_badge,
                accent_color=tokens.accent_color,
            )
        finally:
            TEMPLATE_DEFINITIONS[:] = [t for t in TEMPLATE_DEFINITIONS if t["key"] != bkey]

        video_url = res.get("output_url", "")
        thumb_url = video_url  # for mp4 we also generate a jpg thumb below

        # For story MP4, generate a static JPG thumbnail in parallel
        if slot.ext == "mp4" and video_url:
            jpg_source = copy.deepcopy(branded)
            jpg_source["output_format"] = "jpg"
            for el in jpg_source.get("elements", []):
                el.pop("animations", None)
            jkey = f"{bkey}_jpg"
            TEMPLATE_DEFINITIONS.append({
                "key": jkey, "name": jkey, "description": "",
                "format": "thumb", "preview_label": "", "source": jpg_source,
            })
            try:
                jres = await render_with_template(
                    api_key=api_key, template_id=f"renderscript:{jkey}",
                    photo_url=photo_url, title=title, brand_name=brand_name,
                    subtitle=subtitle, accent_color=tokens.accent_color,
                )
                thumb_url = jres.get("output_url", video_url)
            except Exception:
                thumb_url = video_url
            finally:
                TEMPLATE_DEFINITIONS[:] = [t for t in TEMPLATE_DEFINITIONS if t["key"] != jkey]

        return BundleResult(
            slot=slot.label,
            status="succeeded" if video_url else "failed",
            output_url=video_url,
            thumb_url=thumb_url,
            template_key=tpl_key,
            brand_font=tokens.font_family or _resolve_font(tokens.heading_personality),
        )

    except Exception as e:
        return BundleResult(slot=slot.label, status="failed", error=str(e)[:200])


def _resolve_font(heading_personality: str) -> str:
    from app.services.creatomate_template_service import resolve_brand_font
    return resolve_brand_font(heading_personality, None)


async def _render_slot_fal(
    nextjs_url: str,
    slot: BundleSlot,
    photo_url: str,
    title: str,
    subtitle: str,
    brand_name: str,
    tokens: "CreatomaBrandTokens",
    workspace_id: uuid.UUID,
) -> BundleResult:
    """Render one story still via fal/GPT-image (Next.js /api/generate-instagram-image)."""
    payload = {
        "title": title,
        "caption": subtitle[:300] or title,
        "contentType": "story",
        "brandName": brand_name or "Brand",
        "workspaceId": str(workspace_id),
        "referenceImageUrls": [photo_url],
        "brandVibeProfile": {
            "palette": {
                "primary": tokens.primary_color,
                "accent": tokens.accent_color,
            },
            "typography": {
                "headingFont": tokens.font_family or "Montserrat",
            },
        },
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{nextjs_url}/api/generate-instagram-image", json=payload)
        if not resp.is_success:
            return BundleResult(
                slot.label, "failed",
                error=f"fal HTTP {resp.status_code}: {resp.text[:100]}",
            )
        data = resp.json()
        image_url = data.get("imageUrl") or ""
        return BundleResult(
            slot=slot.label,
            status="succeeded" if image_url else "failed",
            output_url=image_url,
            thumb_url=image_url,
            template_key="fal_story_still",
            brand_font=tokens.font_family or "Montserrat",
        )
    except Exception as e:
        return BundleResult(slot.label, "failed", error=str(e)[:200])


async def generate_brand_bundle(
    api_key: str,
    workspace_id: uuid.UUID,
    photo_url: str,
    title: str,
    subtitle: str = "",
    date_badge: str = "",
    brand_name: str = "",
    tokens: "CreatomaBrandTokens | None" = None,
    nexus_api: str = "",
    internal_key: str = "",
) -> list[BundleResult]:
    """
    Generate 2 story outputs for one content idea.
    Primary: Creatomate when API key is set; otherwise fal/GPT-image still posters.
    Saves each to Nexus artifacts automatically.
    """
    from app.config import get_settings
    settings = get_settings()
    nextjs_url = getattr(settings, "nextjs_url", "http://localhost:3000").rstrip("/")
    tok = tokens or CreatomaBrandTokens()

    if api_key:
        tasks = [
            _render_slot(api_key, slot, photo_url, title, subtitle, date_badge, brand_name, tok, idx=i)
            for i, slot in enumerate(BUNDLE_SLOTS)
        ]
        results: list[BundleResult] = list(await asyncio.gather(*tasks, return_exceptions=False))
    else:
        logger.info("creatomate_key_missing_using_fal_story_still", workspace_id=str(workspace_id))
        tasks_fal = [
            _render_slot_fal(nextjs_url, slot, photo_url, title, subtitle, brand_name, tok, workspace_id)
            for slot in BUNDLE_SLOTS
        ]
        results = list(await asyncio.gather(*tasks_fal, return_exceptions=False))

    # Save successful renders to Nexus
    if nexus_api:
        save_tasks = [
            _save_to_nexus(r, workspace_id, brand_name, title, subtitle, nexus_api, internal_key)
            for r in results if r.status == "succeeded" and r.output_url
        ]
        if save_tasks:
            await asyncio.gather(*save_tasks, return_exceptions=True)

    return results


async def _save_to_nexus(
    result: BundleResult,
    workspace_id: uuid.UUID,
    brand_name: str,
    title: str,
    subtitle: str,
    nexus_api: str,
    internal_key: str,
) -> None:
    is_video = result.output_url.endswith(".mp4") or result.template_key.startswith("story") or result.template_key.startswith("reel")
    fmt = "instagram_story" if "Story" in result.slot or is_video else "instagram_post"
    # Use thumb_url for contentUrl so feed preview shows image, not broken mp4
    content_url = result.thumb_url or result.output_url

    payload = {
        "title": f"{result.slot} — {brand_name}",
        "contentUrl": content_url,
        "content": json.dumps({
            "kind": fmt,
            "imageUrl": content_url,
            "videoUrl": result.output_url if is_video else "",
            "headline": title,
            "caption": subtitle,
            "source": "creatomate_brand",
            "template_key": result.template_key,
            "brand_font": result.brand_font,
        }),
        "platform": "instagram",
        "contentType": fmt,
        "metadata": {
            "auto_produced": True,
            "source": "creatomate_brand",
            "template_key": result.template_key,
            "brand_font": result.brand_font,
            "headline": title,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{nexus_api}/api/artifacts/creative",
                headers={"Content-Type": "application/json",
                         "X-Tenant-Id": str(workspace_id),
                         "X-Internal-Api-Key": internal_key},
                json=payload,
            )
            result.artifact_id = r.json().get("id", "") if r.status_code < 300 else ""
            logger.info("creatomate_artifact_saved",
                        slot=result.slot, artifact_id=result.artifact_id,
                        template=result.template_key)
    except Exception as e:
        logger.warning("creatomate_artifact_save_failed", slot=result.slot, error=str(e)[:100])
