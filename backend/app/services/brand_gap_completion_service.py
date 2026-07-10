"""
Detect and repair critical brand-context gaps for agent + production quality.

Multi-tenant: sector/service-profile driven only — no pilot UUID branches.
Used by POST /api/v1/brand-context/{workspace_id}/complete-gaps.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.crew.industry_playbooks import normalize_industry_id
from app.services.production_design_policy import _read_service_profile

logger = structlog.get_logger()

GENERIC_DESCRIPTION_MARKERS = (
    "local service business sektöründe",
    "brand — local service",
    "hizmet vermektedir.",
    "mevcut müşteriler, potansiyel müşteriler, yerel takipçiler kitlesine",
)

_NAV_LINE_RE = re.compile(r"^(Anasayfa|Hoş\s*geldiniz|Hoş\s*Geldiniz|Welcome)\b", re.I)


def is_corrupted_description(description: str | None) -> bool:
    text = (description or "").strip()
    if len(text) < 24:
        return True
    lower = text.lower()
    return any(marker in lower for marker in GENERIC_DESCRIPTION_MARKERS)


def repair_description_from_discovery(ctx: Any) -> str | None:
    """Prefer real website copy over seed/generic description text."""
    website_summary = str(getattr(ctx, "website_summary", None) or "").strip()
    if not website_summary:
        return None

    for line in website_summary.split("\n"):
        candidate = line.strip()
        if len(candidate) < 40:
            continue
        if _NAV_LINE_RE.match(candidate):
            continue
        return candidate[:2000]

    first = website_summary.split("\n")[0].strip()
    return (first or website_summary)[:2000]


def _parse_json_list(raw: Any) -> list:
    if isinstance(raw, list):
        return raw
    if not raw or not isinstance(raw, str):
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _brand_dna_richness(ctx: Any) -> str | None:
    raw = getattr(ctx, "brand_dna", None)
    if not raw:
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, dict):
            return str(data.get("data_richness") or "").strip() or None
    except Exception:
        return None
    return None


def _calendar_sector_mismatch(ctx: Any, sector: str) -> bool:
    raw = getattr(ctx, "industry_calendar", None)
    if not raw:
        return True
    try:
        cal = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return True
    if not isinstance(cal, dict):
        return True
    cal_type = normalize_industry_id(str(cal.get("industry_type") or ""))
    expected = normalize_industry_id(sector)
    if not cal_type or not expected:
        return False
    if cal_type == expected:
        return False
    # Hospitality family cross-match is ok (beach_club vs beach_hospitality)
    hospitality = {"beach_club", "beach_hospitality", "nightclub", "restaurant_cafe", "hotel_resort"}
    if cal_type in hospitality and expected in hospitality:
        return False
    return True


def _resolve_sector(ctx: Any) -> str:
    sp = _read_service_profile(ctx)
    category = str(sp.get("category") or "").strip()
    if category:
        from app.services.brand_service_profile_service import canonical_sector_from_category

        mapped = canonical_sector_from_category(category)
        if mapped:
            return normalize_industry_id(mapped)
    return normalize_industry_id(str(getattr(ctx, "business_type", None) or "general_business"))


def detect_brand_gaps(ctx: Any) -> list[dict[str, Any]]:
    """Return actionable gaps for this tenant's brand_context row."""
    if ctx is None:
        return [{"id": "brand_context_missing", "label": "Marka profili yok", "severity": "block"}]

    gaps: list[dict[str, Any]] = []
    sector = _resolve_sector(ctx)

    if is_corrupted_description(getattr(ctx, "description", None)):
        gaps.append({
            "id": "description_corrupt",
            "label": "Marka açıklaması generic veya bozuk",
            "severity": "high",
            "fix": "identity",
        })

    visual_dna = str(getattr(ctx, "visual_dna", None) or "").strip()
    if len(visual_dna) < 80:
        gaps.append({
            "id": "visual_dna_missing",
            "label": "Visual DNA eksik",
            "severity": "high",
            "fix": "design",
        })

    richness = _brand_dna_richness(ctx)
    if not richness or richness == "sparse":
        gaps.append({
            "id": "brand_dna_sparse",
            "label": "Marka DNA zayıf veya üretilmedi",
            "severity": "high",
            "fix": "design",
        })

    sp = _read_service_profile(ctx)
    if not str(sp.get("category") or "").strip():
        gaps.append({
            "id": "service_profile_missing",
            "label": "Service profile (sektör) eksik",
            "severity": "medium",
            "fix": "identity",
        })

    if _calendar_sector_mismatch(ctx, sector):
        gaps.append({
            "id": "industry_calendar_stale",
            "label": "Sektör takvimi eksik veya yanlış sektör",
            "severity": "medium",
            "fix": "design",
        })

    pillars = _parse_json_list(getattr(ctx, "content_pillars", None))
    if len(pillars) < 2:
        gaps.append({
            "id": "content_pillars_low",
            "label": "İçerik sütunları yetersiz",
            "severity": "medium",
            "fix": "content",
        })

    ctas = _parse_json_list(getattr(ctx, "default_ctas", None))
    if len(ctas) < 1:
        gaps.append({
            "id": "default_ctas_missing",
            "label": "Varsayılan CTA eksik",
            "severity": "medium",
            "fix": "content",
        })

    discovery = int(getattr(ctx, "discovery_confidence", None) or 0)
    if discovery < 70 and (
        getattr(ctx, "website_url", None) or getattr(ctx, "instagram_handle", None)
    ):
        gaps.append({
            "id": "discovery_low",
            "label": f"Keşif güven skoru düşük ({discovery}/70)",
            "severity": "medium",
            "fix": "brand-analysis",
        })

    theme = getattr(ctx, "brand_theme", None)
    if not isinstance(theme, dict) or not theme:
        gaps.append({
            "id": "brand_theme_missing",
            "label": "Marka teması (görsel kit) eksik",
            "severity": "medium",
            "fix": "brand-theme",
        })
    else:
        library = theme.get("template_library")
        if isinstance(library, dict):
            slots = library.get("slots")
            locked = library.get("locked") is True
            slot_count = len(slots) if isinstance(slots, list) else 0
            if not locked or slot_count < 5:
                gaps.append({
                    "id": "template_library_incomplete",
                    "label": "Şablon kütüphanesi kilitli değil veya eksik",
                    "severity": "medium",
                    "fix": "story-templates",
                })

    if not getattr(ctx, "brand_vibe_profile", None):
        gaps.append({
            "id": "vibe_profile_missing",
            "label": "Brand vibe profile eksik (opsiyonel)",
            "severity": "low",
            "fix": "design",
        })

    ref_urls = _parse_json_list(getattr(ctx, "reference_image_urls", None))
    ga_raw = getattr(ctx, "gallery_analysis", None)
    ga: dict = {}
    if isinstance(ga_raw, dict):
        ga = ga_raw
    elif isinstance(ga_raw, str) and ga_raw.strip():
        try:
            parsed = json.loads(ga_raw)
            ga = parsed if isinstance(parsed, dict) else {}
        except Exception:
            ga = {}
    usable = [u for u in ref_urls if isinstance(u, str) and u.strip()]
    analyzed = sum(1 for u in usable if u in ga)
    if len(usable) >= 8 and len(usable) > 0 and analyzed / len(usable) < 0.9:
        gaps.append({
            "id": "gallery_coverage_low",
            "label": f"Galeri analiz kapsamı düşük ({analyzed}/{len(usable)})",
            "severity": "medium",
            "fix": "gallery",
        })

    return gaps


async def complete_brand_gaps(
    db: AsyncSession,
    workspace_id: UUID,
    *,
    openai_api_key: str = "",
    gap_ids: set[str] | None = None,
) -> dict[str, Any]:
    """
    Run targeted repairs for detected gaps. Idempotent — skips fields already healthy.
    """
    from app.services import brand_context_service
    from app.services.brand_context_service import _parse_reference_image_urls

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        return {"ok": False, "error": "brand_context_not_found", "steps": [], "gaps": []}

    gaps_before = detect_brand_gaps(ctx)
    target_ids = gap_ids or {g["id"] for g in gaps_before}
    steps: list[dict[str, Any]] = []

    async def _step(step_id: str, ok: bool, detail: str = "") -> None:
        steps.append({"id": step_id, "ok": ok, "detail": detail[:240]})

    # ── 1. Description repair (no LLM — website_summary SSOT) ───────────────
    if "description_corrupt" in target_ids and is_corrupted_description(ctx.description):
        fixed = repair_description_from_discovery(ctx)
        if fixed:
            ctx.description = fixed
            await db.flush()
            await _step("description", True, fixed[:120])
        else:
            await _step("description", False, "website_summary yok")

    # ── 2. Service profile ────────────────────────────────────────────────
    if "service_profile_missing" in target_ids:
        try:
            await brand_context_service.persist_brand_service_profile(db, workspace_id)
            await _step("service_profile", True)
        except Exception as exc:
            await _step("service_profile", False, str(exc))

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        return {"ok": False, "error": "brand_context_lost", "steps": steps, "gaps": gaps_before}

    # ── 3. Visual DNA (GPT-4o Vision) ─────────────────────────────────────
    if "visual_dna_missing" in target_ids and openai_api_key:
        visual = str(getattr(ctx, "visual_dna", None) or "").strip()
        if len(visual) < 80:
            image_urls = _parse_reference_image_urls(ctx.reference_image_urls)
            if image_urls:
                try:
                    from app.services.visual_dna_service import ensure_visual_dna

                    dna = await ensure_visual_dna(
                        brand_name=ctx.business_name,
                        reference_image_urls=image_urls,
                        existing_visual_dna=None,
                        api_key=openai_api_key,
                    )
                    if dna:
                        ctx.visual_dna = dna
                        await db.flush()
                        await _step("visual_dna", True, f"{len(dna)} chars")
                    else:
                        await _step("visual_dna", False, "empty result")
                except Exception as exc:
                    await _step("visual_dna", False, str(exc))
            else:
                await _step("visual_dna", False, "no reference images")

    # ── 4. Industry calendar ──────────────────────────────────────────────
    sector = _resolve_sector(ctx)
    if "industry_calendar_stale" in target_ids:
        try:
            from app.services.industry_intelligence_service import build_industry_calendar

            brand = await brand_context_service.build_brand_info(db, workspace_id, skip_cache=True)
            if brand:
                calendar = await build_industry_calendar(brand)
                ctx.industry_calendar = json.dumps(calendar, ensure_ascii=False)
                ctx.industry_intelligence_updated_at = datetime.now(timezone.utc).isoformat()
                await db.flush()
                await _step("industry_calendar", True, sector)
            else:
                await _step("industry_calendar", False, "brand_info unavailable")
        except Exception as exc:
            await _step("industry_calendar", False, str(exc))

    # ── 5. Production design profile (visual_dna rewrite + theme layers) ─
    production_targets = {
        "visual_dna_missing",
        "brand_theme_missing",
        "template_library_incomplete",
        "brand_dna_sparse",
    }
    if target_ids & production_targets and openai_api_key:
        try:
            from app.services.production_design_profile_service import (
                apply_production_design_profile,
                derive_production_design_profile,
            )

            profile = derive_production_design_profile(ctx, openai_api_key=openai_api_key)
            await apply_production_design_profile(db, ctx, profile)
            await db.flush()
            await _step(
                "production_design_profile",
                True,
                str(profile.get("source") or "derived"),
            )
        except Exception as exc:
            await _step("production_design_profile", False, str(exc))

    # ── 6. Brand DNA synthesis ────────────────────────────────────────────
    if "brand_dna_sparse" in target_ids and openai_api_key:
        richness = _brand_dna_richness(ctx)
        if not richness or richness == "sparse":
            try:
                from app.services.brand_dna_service import build_brand_dna

                brand = await brand_context_service.build_brand_info(db, workspace_id, skip_cache=True)
                if brand:
                    dna = await build_brand_dna(brand, openai_api_key=openai_api_key)
                    ctx.brand_dna = json.dumps(dna, ensure_ascii=False)
                    ctx.brand_dna_updated_at = datetime.now(timezone.utc).isoformat()
                    await db.flush()
                    await _step("brand_dna", True, str(dna.get("data_richness") or "ok"))
                else:
                    await _step("brand_dna", False, "brand_info unavailable")
            except Exception as exc:
                await _step("brand_dna", False, str(exc))

    await db.commit()

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    gaps_after = detect_brand_gaps(ctx)
    await brand_context_service.invalidate_brand_info_cache(workspace_id)

    ok_steps = sum(1 for s in steps if s.get("ok"))
    logger.info(
        "brand_gaps_completed",
        workspace_id=str(workspace_id),
        gaps_before=len(gaps_before),
        gaps_after=len(gaps_after),
        steps_ok=ok_steps,
        steps_total=len(steps),
    )

    return {
        "ok": ok_steps > 0 or len(gaps_after) < len(gaps_before),
        "gaps_before": gaps_before,
        "gaps_after": gaps_after,
        "steps": steps,
        "resolved_count": max(0, len(gaps_before) - len(gaps_after)),
    }
