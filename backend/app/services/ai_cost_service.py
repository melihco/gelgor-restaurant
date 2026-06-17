"""
AI cost estimates + workspace / mission attribution.

Unit costs align with apps/web/src/lib/package-plan-config.ts (PLAN_API_UNIT_COSTS).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mission import Mission

logger = structlog.get_logger(__name__)

# USD estimates per Crew / provider action
ESTIMATED_COST_USD: dict[str, float] = {
    "mission_propose": 0.28,
    "content_strategy": 0.20,
    "content_ideation": 1.00,
    "feed_art_director": 0.45,
    "scene_brief": 0.15,
    "gpt_image_enhance": 0.21,
    "gallery_vision_analysis": 0.04,
    "standalone_reel": 0.30,
    "auto_produce": 0.0,  # measured at auto-produce call site
    "other": 0.05,
}

TASK_TYPE_TO_CATEGORY: dict[str, str] = {
    "content_strategy": "content_strategy",
    "content_ideation": "content_ideation",
}


async def record_workspace_ai_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    category: str,
    amount_usd: float | None = None,
    *,
    mission_count: int = 0,
    artifact_count: int = 0,
) -> None:
    """Persist estimated USD to workspace_usage_daily."""
    amt = amount_usd if amount_usd is not None else ESTIMATED_COST_USD.get(category, 0.05)
    if amt <= 0 and artifact_count <= 0 and mission_count <= 0:
        return
    try:
        from app.services.usage_cost_service import record_cost

        await record_cost(
            db,
            workspace_id,
            amt,
            category,
            artifact_count=artifact_count,
            mission_count=mission_count,
        )
    except Exception as exc:
        logger.warning(
            "record_workspace_ai_cost_failed",
            workspace_id=str(workspace_id),
            category=category,
            error=str(exc)[:200],
        )


async def append_mission_ai_cost(
    db: AsyncSession,
    mission_id: uuid.UUID,
    category: str,
    amount_usd: float,
) -> None:
    """Merge category spend into mission.performance_summary.ai_cost_breakdown."""
    if amount_usd <= 0:
        return
    r = await db.execute(
        select(Mission.performance_summary).where(Mission.id == mission_id)
    )
    row = r.one_or_none()
    if not row:
        return
    summary = dict(row[0] or {})
    breakdown = dict(summary.get("ai_cost_breakdown") or {})
    breakdown[category] = round(float(breakdown.get(category, 0)) + amount_usd, 4)
    breakdown["total_usd"] = round(
        sum(v for k, v in breakdown.items() if k != "total_usd" and isinstance(v, (int, float))),
        4,
    )
    breakdown["updated_at"] = datetime.now(timezone.utc).isoformat()
    summary["ai_cost_breakdown"] = breakdown
    await db.execute(
        update(Mission)
        .where(Mission.id == mission_id)
        .execution_options(synchronize_session=False)
        .values(performance_summary=summary),
    )
    await db.commit()


async def record_mission_task_ai_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    task_type: str,
) -> None:
    """Record graph node LLM cost to workspace + mission."""
    category = TASK_TYPE_TO_CATEGORY.get(task_type)
    if not category:
        return
    amount = ESTIMATED_COST_USD.get(category, 0.05)
    await record_workspace_ai_cost(db, workspace_id, category, amount)
    await append_mission_ai_cost(db, mission_id, category, amount)
    logger.info(
        "mission_task_ai_cost_recorded",
        mission_id=str(mission_id),
        task_type=task_type,
        category=category,
        amount_usd=amount,
    )


async def record_mission_category_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    category: str,
    amount_usd: float | None = None,
) -> None:
    amt = amount_usd if amount_usd is not None else ESTIMATED_COST_USD.get(category, 0.05)
    await record_workspace_ai_cost(db, workspace_id, category, amt)
    await append_mission_ai_cost(db, mission_id, category, amt)


def empty_mission_cost_breakdown() -> dict[str, Any]:
    return {"total_usd": 0.0, "categories": {}}
