"""
Production Design Profile — onboarding-grade visual_dna + planning field alignment.

Runs after service_profile derive and before theme/derive. Produces:
  - production-optimized visual_dna (Fal soul format)
  - brand_tone / visual_style
  - content_pillars realigned to sector playbook
  - industry_calendar.industry_type alignment

Multi-tenant: sector + service profile + discovery text only — no pilot UUIDs.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import structlog

from app.crew.industry_playbooks import normalize_industry_id
from app.services.production_design_policy import (
    _read_service_profile,
    align_industry_calendar_type,
    is_hospitality_sector,
    is_premium_venue_sector,
    resolve_content_pillars,
)

logger = structlog.get_logger()

PROFILE_VERSION = 1

_HEX_COLOR_RE = re.compile(r"#[0-9A-Fa-f]{6}\b")


def _brand_palette_hexes_from_ctx(ctx: Any) -> list[str]:
    """
    Collect authoritative brand hex codes for production DNA.

    Priority (high → low): vibe_profile.palette → brand_theme.palette →
    brand_primary/accent columns. Stale column pastels must not override a
    confirmed vibe/theme corporate palette.
    """
    seen: set[str] = set()
    out: list[str] = []

    def _add(raw: Any) -> None:
        value = str(raw or "").strip()
        if not _HEX_COLOR_RE.fullmatch(value):
            return
        key = value.upper()
        if key in seen:
            return
        seen.add(key)
        out.append(key)

    vibe = getattr(ctx, "brand_vibe_profile", None)
    if isinstance(vibe, dict):
        vibe_palette = vibe.get("palette")
        if isinstance(vibe_palette, dict):
            for key in ("primary", "accent", "secondary"):
                _add(vibe_palette.get(key))

    theme = getattr(ctx, "brand_theme", None)
    if isinstance(theme, dict):
        palette = theme.get("palette")
        if isinstance(palette, dict):
            for key in ("primary", "accent", "secondary"):
                _add(palette.get(key))

    for field in ("brand_primary_color", "brand_accent_color"):
        _add(getattr(ctx, field, None))

    return out[:6]


def ensure_visual_dna_palette_hex(visual_dna: str, hexes: list[str]) -> str:
    """
    Inject / reconcile brand kit hex codes into production visual_dna (F2.2).

    Prevents Fal color drift when Palette words are prose-only or still carry
    stale pastel anchors that disagree with the authoritative kit.
    """
    dna = str(visual_dna or "").strip()
    if not hexes:
        return dna

    auth = [h.upper() for h in hexes if _HEX_COLOR_RE.fullmatch(str(h).strip())]
    if not auth:
        return dna

    dna_hexes = {m.group(0).upper() for m in _HEX_COLOR_RE.finditer(dna)}
    auth_set = set(auth)
    # Authoritative hexes already present and no conflicting extras → keep.
    if auth_set.issubset(dna_hexes) and not (dna_hexes - auth_set):
        return dna
    if auth_set.issubset(dna_hexes) and len(dna_hexes - auth_set) <= 2:
        # Allow a couple of secondary hexes in prose; don't rewrite.
        return dna

    hex_line = " · ".join(auth)
    brand_anchor = f"brand anchors {hex_line}"

    if not dna:
        return f"Palette words: {brand_anchor}"

    lines = dna.split("\n")
    for idx, line in enumerate(lines):
        if line.strip().lower().startswith("palette words:"):
            # Drop stale hex tokens, keep non-hex prose, append authoritative anchors.
            prose = _HEX_COLOR_RE.sub("", line)
            prose = re.sub(r"\s*[·•|,]+\s*", " · ", prose)
            prose = re.sub(r"\s{2,}", " ", prose).strip(" ·:")
            # Normalize leading label
            if prose.lower().startswith("palette words"):
                prose_body = prose.split(":", 1)[-1].strip(" ·")
            else:
                prose_body = prose
            # Strip leftover "brand anchors/hex" crumbs
            prose_body = re.sub(
                r"(?i)\bbrand\s+(?:anchors?|hex)\b[:\s]*",
                "",
                prose_body,
            ).strip(" ·")
            if prose_body:
                lines[idx] = f"Palette words: {prose_body} — {brand_anchor}"
            else:
                lines[idx] = f"Palette words: {brand_anchor}"
            return "\n".join(lines)

    insert_at = next(
        (i + 1 for i, line in enumerate(lines) if line.strip().lower().startswith("aesthetic:")),
        len(lines),
    )
    lines.insert(insert_at, f"Palette words: {brand_anchor}")
    return "\n".join(lines)


_PRODUCTION_DNA_SECTIONS = (
    "Mood",
    "Aesthetic",
    "Palette words",
    "Lighting",
    "Photography",
    "Typography feel",
    "Anti-look",
)


def _as_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _as_str_list(raw: Any, *, limit: int = 12) -> list[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()][:limit]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()][:limit]
        except json.JSONDecodeError:
            return [raw.strip()][:limit]
    return []


def _gallery_scene_summary(ctx: Any, *, limit: int = 8) -> str:
    """Compact scene catalog from gallery_analysis for LLM grounding."""
    ga = _as_dict(getattr(ctx, "gallery_analysis", None))
    if not ga:
        return ""
    lines: list[str] = []
    for url, meta in list(ga.items())[:40]:
        if not isinstance(meta, dict):
            continue
        tags = meta.get("tags") or meta.get("labels") or []
        if isinstance(tags, str):
            tag_s = tags.strip()
        elif isinstance(tags, list):
            tag_s = ", ".join(str(t) for t in tags[:6] if str(t).strip())
        else:
            tag_s = ""
        desc = str(
            meta.get("description")
            or meta.get("scene_summary")
            or meta.get("caption")
            or ""
        ).strip()
        bit = " — ".join(p for p in (tag_s, desc[:120]) if p)
        if bit:
            lines.append(f"- {bit}")
        if len(lines) >= limit:
            break
    return "\n".join(lines)


def collect_production_design_context(ctx: Any) -> dict[str, Any]:
    """Gather discovery + vibe signals for production DNA derivation (testable)."""
    sp = _read_service_profile(ctx)
    pillars_raw = getattr(ctx, "content_pillars", None)
    pillars: list[str] = []
    if isinstance(pillars_raw, list):
        pillars = [str(p) for p in pillars_raw]
    elif isinstance(pillars_raw, str) and pillars_raw.strip():
        try:
            parsed = json.loads(pillars_raw)
            if isinstance(parsed, list):
                pillars = [str(p) for p in parsed]
        except json.JSONDecodeError:
            pillars = [p.strip() for p in pillars_raw.split(",") if p.strip()]

    vibe = _as_dict(getattr(ctx, "brand_vibe_profile", None))
    website_intel = _as_dict(getattr(ctx, "website_intelligence", None))
    ig_intel = _as_dict(getattr(ctx, "instagram_intelligence", None))
    captions = _as_str_list(getattr(ctx, "instagram_recent_captions", None), limit=10)

    menu_bits: list[str] = []
    for key in ("menu_highlights", "signature_dishes", "catalog_highlights", "products", "menu_categories"):
        val = website_intel.get(key)
        if isinstance(val, list):
            menu_bits.extend(str(x) for x in val[:6] if str(x).strip())
        elif isinstance(val, str) and val.strip():
            menu_bits.append(val.strip()[:200])

    return {
        "business_name": getattr(ctx, "business_name", "") or "",
        "business_type": getattr(ctx, "business_type", "") or "",
        "description": getattr(ctx, "description", "") or "",
        "brand_tone": getattr(ctx, "brand_tone", "") or "",
        "visual_style": getattr(ctx, "visual_style", "") or "",
        "visual_dna": getattr(ctx, "visual_dna", "") or "",
        "languages": getattr(ctx, "languages", "tr") or "tr",
        "location": getattr(ctx, "location", "") or "",
        "website_summary": getattr(ctx, "website_summary", "") or "",
        "content_pillars": pillars,
        "brand_service_profile": sp,
        "brand_vibe_profile": vibe,
        "website_intelligence": website_intel,
        "instagram_intelligence": ig_intel,
        "instagram_recent_captions": captions,
        "gallery_scene_summary": _gallery_scene_summary(ctx),
        "menu_or_catalog_signals": menu_bits[:10],
        "instagram_handle": getattr(ctx, "instagram_handle", "") or "",
    }


# Backward-compatible alias used by older call sites / tests.
_ctx_dict = collect_production_design_context


def build_production_design_llm_prompt(data: dict[str, Any], sector: str) -> str:
    """Build the art-director prompt — exported for unit tests."""
    sp = data.get("brand_service_profile") or {}
    vibe = data.get("brand_vibe_profile") or {}
    ig_intel = data.get("instagram_intelligence") or {}
    captions = data.get("instagram_recent_captions") or []
    menu_signals = data.get("menu_or_catalog_signals") or []
    gallery_summary = str(data.get("gallery_scene_summary") or "").strip()

    vibe_compact = ""
    if isinstance(vibe, dict) and vibe:
        vibe_compact = json.dumps(
            {
                "palette": vibe.get("palette"),
                "grading": vibe.get("grading"),
                "typography": vibe.get("typography"),
                "motion": vibe.get("motion"),
                "composition": vibe.get("composition"),
                "audio": vibe.get("audio"),
                "caption_voice": vibe.get("caption_voice"),
                "anti_patterns": vibe.get("anti_patterns"),
                "content_pillars_visual": vibe.get("content_pillars_visual"),
            },
            ensure_ascii=False,
        )[:2200]

    ig_compact = ""
    if isinstance(ig_intel, dict) and ig_intel:
        ig_compact = json.dumps(
            {
                "content_themes": ig_intel.get("content_themes") or ig_intel.get("themes"),
                "aesthetic": ig_intel.get("aesthetic") or ig_intel.get("visual_style"),
                "audience": ig_intel.get("audience") or ig_intel.get("target_audience"),
                "summary": ig_intel.get("summary") or ig_intel.get("overview"),
            },
            ensure_ascii=False,
        )[:900]

    caption_block = "\n".join(f"- {c[:160]}" for c in captions[:8] if c)
    menu_block = ", ".join(str(m)[:80] for m in menu_signals[:8])

    return f"""You are a senior art director onboarding a brand into an AI social production system.

Brand: {data.get("business_name")}
Sector (guardrail only — do NOT invent a generic sector cliché): {sector}
Location: {data.get("location")}
Languages: {data.get("languages")}
Instagram: @{str(data.get("instagram_handle") or "").lstrip("@")}
Description: {str(data.get("description") or "")[:600]}
Website summary: {str(data.get("website_summary") or "")[:500]}
Service profile category: {sp.get("category")}
Signature offerings: {sp.get("signature_offerings")}
Content guardrails: {sp.get("content_guardrails")}
Menu / catalog signals: {menu_block or "(none)"}
Gallery scene catalog:
{gallery_summary or "(none)"}
Instagram intelligence: {ig_compact or "(none)"}
Recent captions:
{caption_block or "(none)"}
Brand vibe profile (authoritative when present — fuse into DNA):
{vibe_compact or "(none — derive from gallery/captions/website)"}
Existing visual_dna (rewrite for production Fal format): {str(data.get("visual_dna") or "")[:800]}

Return JSON only:
{{
  "visual_dna": "multi-line string with EXACT section headers: Mood, Aesthetic, Palette words, Lighting, Photography, Typography feel, Anti-look",
  "brand_tone": "3-5 comma-separated tone words matching brand language",
  "visual_style": "one line production visual style directive",
  "content_pillars": ["pillar_id", "..."] — use sector-appropriate playbook ids only
}}

Rules:
- Be BRAND-SPECIFIC: name signature offerings, materials, rituals, or menu items from the signals above.
- Sector is a guardrail only. FORBIDDEN generic boilerplate such as "Cycladic / Mediterranean beach club", "bohemian-luxe agora", or copy-pasted wellness spa DNA when the brand is a beach club / bar / shop.
- For beach_club / hotel / premium hospitality: NEVER wellness/skincare as primary identity
- visual_dna must be production-ready for Fal overlay prompts (no markdown headers like **Brand**)
- Palette words MUST mention brand hex codes when provided in existing DNA or vibe palette
- Anti-look must list 4+ concrete things THIS brand would never post
- content_pillars must NOT include educational_post/service_intro for beach clubs unless brand is pure spa
"""


def _sector_from_ctx(data: dict[str, Any]) -> str:
    sp = data.get("brand_service_profile") or {}
    category = str(sp.get("category") or "").strip()
    if category:
        from app.services.brand_service_profile_service import canonical_sector_from_category

        mapped = canonical_sector_from_category(category)
        if mapped:
            return normalize_industry_id(mapped)
    return normalize_industry_id(str(data.get("business_type") or ""))


def _heuristic_brand_tone(sector: str, data: dict[str, Any]) -> str:
    existing = str(data.get("brand_tone") or "").strip()
    if existing and not re.search(r"samimi,\s*sıcak,\s*güvenilir", existing, re.I):
        if not is_hospitality_sector(sector) or "wellness" not in existing.lower():
            return existing
    if is_premium_venue_sector(sector):
        lang = str(data.get("languages") or "tr").split(",")[0].lower()
        return (
            "refined, sensual, communal, unhurried"
            if lang.startswith("en")
            else "seçkin, duyusal, topluluk odaklı, acele etmeyen"
        )
    if "local_products" in sector:
        return "samimi, doğal, güvenilir, üretici odaklı"
    if "beauty" in sector:
        return "güven verici, ferah, ilham verici"
    return existing or "samimi, sıcak, güvenilir"


def _heuristic_visual_style(sector: str) -> str:
    if is_premium_venue_sector(sector):
        return "photo-led bohemian-luxe editorial; quiet type; natural materials"
    if "local_products" in sector:
        return "organic artisan product photography; warm natural light; authentic textures"
    if "beauty" in sector:
        return "clean soft editorial; minimal type; skin-safe calm palette"
    return "warm natural editorial; clean layout; brand-consistent overlays"


def _heuristic_visual_dna(sector: str, data: dict[str, Any]) -> str:
    name = str(data.get("business_name") or "Brand").strip()
    location = str(data.get("location") or "").strip()
    sp = data.get("brand_service_profile") or {}
    offerings = ", ".join(str(o) for o in (sp.get("signature_offerings") or [])[:3])
    existing = str(data.get("visual_dna") or "")

    if is_premium_venue_sector(sector):
        return "\n".join([
            "Mood: bohemian-luxe, sensual, communal, unhurried gathering ritual",
            f"Aesthetic: Cycladic / Mediterranean venue atmosphere for {name}"
            + (f" ({location})" if location else "")
            + " — weathered stone, whitewash, rattan, linen, natural shade",
            "Palette words: sand, bone white, sun-bleached linen, warm stone, soft terracotta, deep sea shadow — never neon, never chrome club",
            "Lighting: natural golden-hour and late-afternoon haze; candle and firelight after dusk; soft filmic contrast",
            "Photography: photo-led editorial; intimate gatherings, dining rituals, music as atmosphere not festival flyer",
            "Typography feel: quiet luxury — refined serif or restrained modern; sparse words; never shouty uppercase posters",
            "Anti-look: neon glow, EDM flyer, party sticker packs, gold-chrome luxury cliché, dense promo grids",
        ])

    if "local_products" in sector:
        return "\n".join([
            f"Mood: authentic, artisan, trustworthy local producer — {name}",
            "Aesthetic: farm-to-table honesty, wooden surfaces, hand labels, harvest textures",
            "Palette words: olive green, honey amber, kraft brown, cream, forest shadow",
            "Lighting: soft daylight, window light, rustic warmth",
            "Photography: product hero + maker hands + ingredient close-ups; never sterile supermarket stock",
            "Typography feel: warm serif or rustic sans; short honest words",
            "Anti-look: neon discount stickers, fake bio badges, generic e-commerce grids",
        ])

    if existing and len(existing) > 120 and any(s in existing for s in _PRODUCTION_DNA_SECTIONS):
        return existing

    # Generic rewrite from existing prose
    mood = "sophisticated and approachable"
    if re.search(r"warm|cozy|samimi", existing, re.I):
        mood = "warm, inviting, authentic"
    aesthetic = offerings or str(data.get("description") or "")[:160] or "brand-consistent editorial"
    return "\n".join([
        f"Mood: {mood}",
        f"Aesthetic: {aesthetic[:200]}",
        "Palette words: derived from brand photography — stay faithful to gallery colors",
        "Lighting: natural editorial light; avoid harsh flash or oversaturated club look",
        "Photography: photo-led; caption-specific compositions; real venue/product only",
        "Typography feel: sector-appropriate, minimal overlay, readable at mobile scale",
        "Anti-look: generic template cards, unreadable text blocks, off-brand neon",
    ])


def _llm_production_design_profile(data: dict[str, Any], sector: str, api_key: str) -> dict[str, Any] | None:
    try:
        from openai import OpenAI
    except ImportError:
        return None

    client = OpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL", "gpt-4o")
    prompt = build_production_design_llm_prompt(data, sector)

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=1100,
        )
        raw = resp.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and parsed.get("visual_dna"):
            return parsed
    except Exception as exc:
        logger.warning("production_design_profile_llm_failed", error=str(exc)[:200])
    return None


def derive_production_design_profile(ctx: Any, *, openai_api_key: str = "") -> dict[str, Any]:
    """Pure derivation — no DB writes."""
    data = collect_production_design_context(ctx)
    sector = _sector_from_ctx(data)
    sp = data.get("brand_service_profile") or {}

    llm_out = _llm_production_design_profile(data, sector, openai_api_key) if openai_api_key else None

    visual_dna = str((llm_out or {}).get("visual_dna") or "").strip() or _heuristic_visual_dna(sector, data)
    visual_dna = ensure_visual_dna_palette_hex(visual_dna, _brand_palette_hexes_from_ctx(ctx))
    brand_tone = str((llm_out or {}).get("brand_tone") or "").strip() or _heuristic_brand_tone(sector, data)
    visual_style = str((llm_out or {}).get("visual_style") or "").strip() or _heuristic_visual_style(sector)
    pillars_in = (llm_out or {}).get("content_pillars") if llm_out else data.get("content_pillars")
    if not isinstance(pillars_in, list):
        pillars_in = data.get("content_pillars")
    content_pillars = resolve_content_pillars(sector, pillars_in if isinstance(pillars_in, list) else None)

    return {
        "version": PROFILE_VERSION,
        "sector": sector,
        "source": "onboarding_llm" if llm_out else "onboarding_heuristic",
        "visual_dna": visual_dna,
        "brand_tone": brand_tone,
        "visual_style": visual_style,
        "content_pillars": content_pillars,
        "industry_type": sector,
        "service_profile_category": sp.get("category"),
    }


async def apply_production_design_profile(
    db,
    ctx: Any,
    profile: dict[str, Any],
) -> dict[str, Any]:
    """Persist profile fields on brand_context and align industry_calendar."""
    import json as _json
    from datetime import datetime, timezone

    from sqlalchemy import update

    from app.models.brand_context import BrandContext

    sector = str(profile.get("sector") or normalize_industry_id(getattr(ctx, "business_type", "") or ""))
    sp = _read_service_profile(ctx)

    updates: dict[str, Any] = {
        "visual_dna": profile.get("visual_dna"),
        "brand_tone": profile.get("brand_tone"),
        "visual_style": profile.get("visual_style"),
        "content_pillars": _json.dumps(profile.get("content_pillars") or [], ensure_ascii=False),
        "updated_at": datetime.now(timezone.utc),
    }

    cal_raw = getattr(ctx, "industry_calendar", None)
    if cal_raw:
        try:
            cal = _json.loads(cal_raw) if isinstance(cal_raw, str) else dict(cal_raw)
            cal = align_industry_calendar_type(cal, sector, sp)
            updates["industry_calendar"] = _json.dumps(cal, ensure_ascii=False)
        except Exception:
            pass

    await db.execute(
        update(BrandContext)
        .where(BrandContext.workspace_id == ctx.workspace_id)
        .execution_options(synchronize_session=False)
        .values(**updates),
    )
    await db.commit()

    for k, v in updates.items():
        if k != "updated_at":
            setattr(ctx, k, v)

    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme

    theme = await derive_brand_theme(ctx)
    await save_brand_theme(ctx, theme, db)

    from app.services.brand_context_service import invalidate_brand_info_cache

    await invalidate_brand_info_cache(getattr(ctx, "workspace_id"))

    logger.info(
        "production_design_profile_applied",
        workspace_id=str(getattr(ctx, "workspace_id", "")),
        sector=sector,
        source=profile.get("source"),
    )
    return profile
