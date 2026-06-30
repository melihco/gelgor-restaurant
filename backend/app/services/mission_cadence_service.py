"""
Mission Cadence Service — dry-run cadence planner.

Calculates how missions should be distributed across the month based on the
tenant's subscription plan (MonthlyMissions from PackagePlanCatalog). This
service is telemetry-only by default; actual autonomous propose/approve is
gated behind AUTONOMOUS_MISSION_CADENCE_ENABLED (default False).

Cadence formula:
    daily_budget = ceil(monthly_missions / 30)
    spacing_days = floor(30 / monthly_missions)

Guards:
    - missions_started_this_month >= monthly_quota → skip
    - active_mission_exists → skip
    - days_since_last_mission < spacing_days → skip
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from math import ceil, floor
from typing import Any

import structlog
from sqlalchemy import and_, select

from app.config import get_settings
from app.database import async_session_factory
from app.models.mission import Mission

logger = structlog.get_logger()

# Default plan specs — mirrored from PackagePlanCatalog.cs
_PLAN_MONTHLY_MISSIONS: dict[str, int] = {
    "starter": 14,
    "growth": 28,
    "performance": 65,
    "executive": 999,
}


def resolve_monthly_missions(plan_slug: str | None) -> int:
    if not plan_slug:
        return _PLAN_MONTHLY_MISSIONS["starter"]
    return _PLAN_MONTHLY_MISSIONS.get(plan_slug.lower().strip(), 14)


def compute_cadence(monthly_missions: int) -> dict[str, Any]:
    daily_budget = ceil(monthly_missions / 30)
    spacing_days = max(1, floor(30 / monthly_missions)) if monthly_missions > 0 else 7
    return {
        "monthly_missions": monthly_missions,
        "daily_budget": daily_budget,
        "spacing_days": spacing_days,
    }


async def evaluate_workspace_cadence(
    workspace_id: uuid.UUID,
    plan_slug: str | None = None,
) -> dict[str, Any]:
    """Evaluate whether this workspace should propose a new mission today.

    Returns a dict with cadence metrics and a boolean `should_propose`.
    This is dry-run only — does NOT create missions.
    """
    monthly_missions = resolve_monthly_missions(plan_slug)
    cadence = compute_cadence(monthly_missions)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    async with async_session_factory() as db:
        # Count missions started this month
        r = await db.execute(
            select(Mission).where(
                and_(
                    Mission.workspace_id == workspace_id,
                    Mission.status.in_(["approved", "in_flight", "completed"]),
                    Mission.created_at >= month_start,
                )
            )
        )
        month_missions = r.scalars().all()
        missions_this_month = len(month_missions)

        # Check active mission
        r2 = await db.execute(
            select(Mission).where(
                and_(
                    Mission.workspace_id == workspace_id,
                    Mission.status.in_(["approved", "in_flight"]),
                )
            )
        )
        active_exists = r2.scalar_one_or_none() is not None

        # Days since last mission
        r3 = await db.execute(
            select(Mission.created_at).where(
                and_(
                    Mission.workspace_id == workspace_id,
                    Mission.status.in_(["approved", "in_flight", "completed"]),
                )
            ).order_by(Mission.created_at.desc()).limit(1)
        )
        last_row = r3.first()
        days_since_last = None
        if last_row and last_row[0]:
            last_at = last_row[0]
            if last_at.tzinfo is None:
                last_at = last_at.replace(tzinfo=timezone.utc)
            days_since_last = (now - last_at).days

    quota_exhausted = missions_this_month >= monthly_missions
    too_soon = (
        days_since_last is not None
        and days_since_last < cadence["spacing_days"]
    )
    should_propose = not quota_exhausted and not active_exists and not too_soon

    result = {
        **cadence,
        "workspace_id": str(workspace_id),
        "missions_this_month": missions_this_month,
        "active_exists": active_exists,
        "days_since_last": days_since_last,
        "quota_exhausted": quota_exhausted,
        "too_soon": too_soon,
        "should_propose": should_propose,
    }

    logger.info("mission_cadence_evaluation", **result)
    return result


async def cadence_dry_run_all() -> list[dict[str, Any]]:
    """Evaluate cadence for all workspaces (scheduler telemetry job)."""
    settings = get_settings()
    if not getattr(settings, "autonomous_mission_cadence_enabled", False):
        logger.info("mission_cadence_dry_run_skipped", reason="flag_disabled")
        return []

    from app.models.brand_context import BrandContext

    results = []
    async with async_session_factory() as db:
        r = await db.execute(select(BrandContext.workspace_id))
        workspace_ids = [row[0] for row in r.all()]

    for ws_id in workspace_ids:
        try:
            result = await evaluate_workspace_cadence(ws_id)
            results.append(result)
        except Exception as exc:
            logger.warning(
                "mission_cadence_eval_failed",
                workspace_id=str(ws_id),
                error=str(exc)[:200],
            )

    logger.info(
        "mission_cadence_dry_run_complete",
        workspaces=len(results),
        should_propose=sum(1 for r in results if r["should_propose"]),
    )
    return results
