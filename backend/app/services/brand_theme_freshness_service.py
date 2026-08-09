"""
Keep brand_theme aligned with the richest available signals.

- Soft-enrich a thin vibe from IG intelligence + brand colors when vision vibe is missing
- Re-derive theme when source is sector_default/visual_dna/vibe_profile (never clobber manual_colors)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.brand_context_service import get_brand_context

logger = structlog.get_logger(__name__)

_AUTO_THEME_SOURCES = frozenset({"sector_default", "visual_dna", "vibe_profile", ""})
_STUB_NAMES = frozenset({"brand", "test", "demo"})


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = str(value).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s.replace(" ", "T"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _vibe_is_thin(vibe: Any) -> bool:
    if not isinstance(vibe, dict) or not vibe:
        return True
    # Full extract has typography/composition/caption_voice; soft enrich may only have palette.
    rich_keys = ("typography", "composition", "caption_voice", "motion", "reference_frames")
    return not any(vibe.get(k) for k in rich_keys)


def build_soft_vibe_from_signals(ctx: Any) -> dict[str, Any] | None:
    """Build a usable thin vibe when gallery vision extract has not run."""
    intel = getattr(ctx, "instagram_intelligence", None)
    if isinstance(intel, str):
        try:
            import json
            intel = json.loads(intel)
        except Exception:
            intel = None
    if not isinstance(intel, dict):
        intel = {}

    voice = intel.get("brand_voice") if isinstance(intel.get("brand_voice"), dict) else {}
    primary = (getattr(ctx, "brand_primary_color", None) or "").strip() or "#1a1a1a"
    accent = (getattr(ctx, "brand_accent_color", None) or "").strip() or "#c9a227"
    font = (getattr(ctx, "brand_font_family", None) or "").strip() or "Inter"

    has_signal = bool(voice) or bool(getattr(ctx, "visual_dna", None)) or bool(
        getattr(ctx, "brand_primary_color", None)
    )
    if not has_signal:
        return None

    caption_rules: list[str] = []
    if voice.get("primary_tone"):
        caption_rules.append(f"Ton: {voice['primary_tone']}")
    if voice.get("writing_style"):
        caption_rules.append(str(voice["writing_style"])[:160])
    if voice.get("emoji_usage"):
        caption_rules.append(f"Emoji: {voice['emoji_usage']}")
    if voice.get("caption_length"):
        caption_rules.append(f"Uzunluk: {voice['caption_length']}")

    themes = intel.get("content_themes") or []
    anti: list[str] = []
    if isinstance(themes, list):
        for t in themes[:3]:
            if isinstance(t, dict) and t.get("avoid"):
                anti.append(str(t["avoid"])[:120])
            elif isinstance(t, str) and "kaçın" in t.lower():
                anti.append(t[:120])

    now = datetime.now(timezone.utc).isoformat()
    return {
        "palette": {
            "primary": primary,
            "accent": accent,
            "neutral": "#f5f0e8",
            "shadow": "#1a0f07",
            "description": "soft-enriched from brand colors + IG voice",
        },
        "typography": {
            "heading_font": font,
            "body_font": "Inter",
            "personality": str(voice.get("primary_tone") or getattr(ctx, "brand_tone", "") or "")[:80],
        },
        "caption_voice": {
            "tone": voice.get("primary_tone") or getattr(ctx, "brand_tone", None),
            "style": voice.get("writing_style"),
            "emoji_usage": voice.get("emoji_usage"),
            "length": voice.get("caption_length"),
            "writing_rules": caption_rules,
            "rules": caption_rules,
        },
        "grading": {
            "look": (getattr(ctx, "visual_dna", None) or "")[:120] or "brand-accurate editorial",
        },
        "anti_patterns": anti,
        "source": "soft_enrich_ig_visual",
        "enrichment_note": "Thin vibe until gallery vision extract-vibe runs",
        "enriched_at": now,
        "refreshed_at": now,
    }


async def ensure_brand_theme_waterfall(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    force: bool = False,
    max_theme_age_days: int = 30,
) -> dict[str, Any]:
    ctx = await get_brand_context(db, workspace_id)
    if not ctx:
        return {"ok": False, "reason": "no_brand"}
    if (ctx.business_name or "").strip().lower() in _STUB_NAMES:
        return {"ok": False, "reason": "stub_brand"}

    theme = ctx.brand_theme if isinstance(ctx.brand_theme, dict) else {}
    source = str(theme.get("source") or "")
    theme_age = _parse_ts(getattr(ctx, "brand_theme_updated_at", None) or theme.get("derived_at"))
    stale = True
    if theme_age and not force:
        stale = (datetime.now(timezone.utc) - theme_age).days >= max_theme_age_days

    if source == "manual_colors" and not force:
        return {"ok": True, "skipped": True, "reason": "manual_theme_locked", "source": source}

    soft_applied = False
    vibe = ctx.brand_vibe_profile
    if _vibe_is_thin(vibe):
        soft = build_soft_vibe_from_signals(ctx)
        if soft:
            # Preserve richer keys if a partial vibe already exists
            merged = dict(vibe) if isinstance(vibe, dict) else {}
            for k, v in soft.items():
                if k not in merged or not merged.get(k):
                    merged[k] = v
            # Always refresh palette/caption from soft when thin
            merged["palette"] = soft["palette"]
            merged["caption_voice"] = soft["caption_voice"]
            merged["enrichment_note"] = soft["enrichment_note"]
            merged["enriched_at"] = soft["enriched_at"]
            ctx.brand_vibe_profile = merged
            ctx.brand_vibe_profile_updated_at = datetime.now(timezone.utc)
            soft_applied = True

    needs_derive = force or not theme or source in _AUTO_THEME_SOURCES or stale or soft_applied
    if not needs_derive:
        return {"ok": True, "skipped": True, "reason": "theme_fresh", "source": source}

    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme

    derived = await derive_brand_theme(ctx)
    await save_brand_theme(ctx, derived, db)
    logger.info(
        "brand_theme_waterfall_ensured",
        workspace_id=str(workspace_id),
        source=derived.source,
        soft_vibe=soft_applied,
    )
    return {
        "ok": True,
        "skipped": False,
        "source": derived.source,
        "soft_vibe": soft_applied,
    }
