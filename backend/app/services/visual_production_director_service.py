"""
Opt-in Visual Production Director — enriches ideas before auto-produce.

Default OFF. When disabled, ideas pass through unchanged (zero behavior change).
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import structlog

logger = structlog.get_logger()

ENV_FLAG = "ENABLE_VISUAL_PRODUCTION_DIRECTOR"
THEME_FLAG = "enable_visual_production_director"


def _env_enabled() -> bool:
    return os.getenv(ENV_FLAG, "").strip().lower() in ("1", "true", "yes", "on")


def _theme_enabled(brand_theme: dict | None) -> bool:
    if not isinstance(brand_theme, dict):
        return False
    return bool(brand_theme.get(THEME_FLAG))


async def is_visual_production_director_enabled(
    db,
    workspace_id: uuid.UUID,
) -> bool:
    """Env OR per-tenant brand_theme flag must be true."""
    if not _env_enabled():
        from app.services import brand_context_service

        ctx = await brand_context_service.get_brand_context(db, workspace_id)
        theme = ctx.brand_theme if ctx and isinstance(ctx.brand_theme, dict) else None
        return _theme_enabled(theme)
    return True


def merge_vpd_specs_into_ideas(
    ideas: list[dict[str, Any]],
    vpd_result: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Merge VPD specs into ideas. Existing visual_production_spec keys always win.
    """
    specs = vpd_result.get("specs")
    if not isinstance(specs, list) or not specs:
        return ideas

    by_index: dict[int, dict[str, Any]] = {}
    for item in specs:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("idea_index", -1))
        except (TypeError, ValueError):
            continue
        if idx < 0:
            continue
        incoming = item.get("visual_production_spec")
        if isinstance(incoming, dict):
            by_index[idx] = incoming

    if not by_index:
        return ideas

    out: list[dict[str, Any]] = []
    for i, idea in enumerate(ideas):
        if not isinstance(idea, dict):
            out.append(idea)
            continue
        merged_idea = dict(idea)
        incoming = by_index.get(i)
        if incoming:
            existing = merged_idea.get("visual_production_spec")
            if not isinstance(existing, dict):
                existing = {}
            # Incoming first, then existing overwrites — preserves content ideation VPS
            merged_vps = {**incoming, **existing}
            merged_idea["visual_production_spec"] = merged_vps
            meta = merged_idea.get("_vpd_meta")
            if not isinstance(meta, dict):
                meta = {}
            meta["enriched"] = True
            meta["filled_keys"] = [
                k for k in incoming
                if k not in existing or not existing.get(k)
            ]
            merged_idea["_vpd_meta"] = meta
        out.append(merged_idea)

    return out


async def maybe_enrich_ideas_with_visual_director(
    db,
    workspace_id: uuid.UUID,
    brand: Any,
    ideas: list[dict[str, Any]],
    *,
    mission_ctx: dict[str, str] | None = None,
    feed_director_report: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if not ideas:
        return ideas
    if not await is_visual_production_director_enabled(db, workspace_id):
        return ideas

    try:
        from app.crew.crews.visual_production_director_crew import run_visual_production_director

        ctx = mission_ctx or {}
        pkg = (
            (feed_director_report or {}).get("production_package")
            or ctx.get("production_package")
            or "weekly_content"
        )
        vpd = run_visual_production_director(
            brand=brand,
            ideas=ideas,
            weekly_theme=ctx.get("mission_title") or ctx.get("creative_brief") or "",
            production_package=str(pkg),
            feed_director_report=feed_director_report,
        )
        enriched = merge_vpd_specs_into_ideas(ideas, vpd)
        logger.info(
            "visual_production_director.enriched",
            workspace_id=str(workspace_id),
            spec_count=len(vpd.get("specs") or []),
            source=vpd.get("_source"),
        )
        return enriched
    except Exception as exc:
        logger.warning(
            "visual_production_director.enrich_skipped",
            workspace_id=str(workspace_id),
            error=str(exc)[:200],
        )
        return ideas
