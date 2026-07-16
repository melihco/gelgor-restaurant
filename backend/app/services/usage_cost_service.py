"""
Per-workspace daily API cost tracking and budget enforcement.

Costs are estimates (USD) recorded at call sites (auto-produce, strategist, scheduler).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.workspace_usage import WorkspaceUsageDaily

logger = structlog.get_logger(__name__)

# Standard cost categories (keys in breakdown JSON)
CATEGORY_AUTO_PRODUCE = "auto_produce"
CATEGORY_MISSION_PROPOSE = "mission_propose"
CATEGORY_CONTENT_IDEATION = "content_ideation"
CATEGORY_CONTENT_STRATEGY = "content_strategy"
CATEGORY_FEED_ART_DIRECTOR = "feed_art_director"
CATEGORY_SCENE_BRIEF = "scene_brief"
CATEGORY_GPT_IMAGE_ENHANCE = "gpt_image_enhance"
CATEGORY_GALLERY_VISION = "gallery_vision_analysis"
CATEGORY_MARKET_INTELLIGENCE = "market_intelligence"
CATEGORY_GALLERY_MATCH = "gallery_match"
CATEGORY_OTHER = "other"


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _to_float(value: Decimal | float | int) -> float:
    return float(value)


async def _get_or_create_row(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    usage_date: date,
) -> WorkspaceUsageDaily:
    result = await db.execute(
        select(WorkspaceUsageDaily).where(
            WorkspaceUsageDaily.workspace_id == workspace_id,
            WorkspaceUsageDaily.usage_date == usage_date,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return row

    row = WorkspaceUsageDaily(
        workspace_id=workspace_id,
        usage_date=usage_date,
        cost_usd=Decimal("0"),
        artifact_count=0,
        mission_count=0,
        breakdown={},
    )
    db.add(row)
    await db.flush()
    return row


async def record_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    amount_usd: float,
    category: str,
    *,
    artifact_count: int = 0,
    mission_count: int = 0,
    usage_date: date | None = None,
) -> WorkspaceUsageDaily:
    """Add estimated cost to today's bucket for a workspace."""
    if amount_usd <= 0 and artifact_count <= 0 and mission_count <= 0:
        result = await db.execute(
            select(WorkspaceUsageDaily).where(
                WorkspaceUsageDaily.workspace_id == workspace_id,
                WorkspaceUsageDaily.usage_date == (usage_date or _utc_today()),
            )
        )
        existing = result.scalar_one_or_none()
        return existing or await _get_or_create_row(db, workspace_id, usage_date or _utc_today())

    day = usage_date or _utc_today()
    row = await _get_or_create_row(db, workspace_id, day)

    row.cost_usd = Decimal(str(_to_float(row.cost_usd) + amount_usd))
    row.artifact_count += max(0, artifact_count)
    row.mission_count += max(0, mission_count)

    breakdown = dict(row.breakdown or {})
    breakdown[category] = round(float(breakdown.get(category, 0)) + amount_usd, 4)
    row.breakdown = breakdown

    await db.commit()
    await db.refresh(row)
    logger.info(
        "usage_cost_recorded",
        workspace_id=str(workspace_id),
        category=category,
        amount_usd=round(amount_usd, 4),
        day_total=_to_float(row.cost_usd),
    )
    return row


async def get_daily_row(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    usage_date: date | None = None,
) -> WorkspaceUsageDaily | None:
    day = usage_date or _utc_today()
    result = await db.execute(
        select(WorkspaceUsageDaily).where(
            WorkspaceUsageDaily.workspace_id == workspace_id,
            WorkspaceUsageDaily.usage_date == day,
        )
    )
    return result.scalar_one_or_none()


async def check_budget(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    additional_cost_usd: float = 0.0,
    package_slug: str | None = None,
) -> dict[str, Any]:
    """
    Return whether workspace can spend more today under daily USD cap
    and optional monthly token wallet.
    """
    settings = get_settings()
    daily_cap = settings.workspace_daily_budget_usd
    row = await get_daily_row(db, workspace_id)
    spent = _to_float(row.cost_usd) if row else 0.0
    projected = spent + max(0.0, additional_cost_usd)
    remaining = max(0.0, daily_cap - spent)
    allowed = projected <= daily_cap + 1e-6
    reason: str | None = None

    if settings.auto_produce_bypass_limits:
        token_check: dict[str, Any] | None = None
        if settings.token_billing_enabled:
            from app.services.token_billing_service import check_token_wallet
            token_check = await check_token_wallet(
                db, workspace_id, additional_cost_usd, package_slug,
            )
        return {
            "allowed": True,
            "spent_today_usd": round(spent, 4),
            "remaining_usd": round(daily_cap, 4),
            "daily_budget_usd": daily_cap,
            "projected_usd": round(projected, 4),
            "reason": None,
            "token_wallet": token_check,
            "limits_bypassed": True,
        }

    if not allowed:
        reason = f"Günlük API bütçesi doldu (${spent:.2f} / ${daily_cap:.2f})"

    token_check: dict[str, Any] | None = None
    if settings.token_billing_enabled:
        from app.services.token_billing_service import check_token_wallet
        token_check = await check_token_wallet(
            db, workspace_id, additional_cost_usd, package_slug,
        )
        if not token_check["allowed"]:
            allowed = False
            reason = token_check.get("reason") or reason

    return {
        "allowed": allowed,
        "spent_today_usd": round(spent, 4),
        "remaining_usd": round(remaining, 4),
        "daily_budget_usd": daily_cap,
        "projected_usd": round(projected, 4),
        "reason": reason,
        "token_wallet": token_check,
    }


async def get_usage_summary(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    days: int = 7,
    package_slug: str | None = None,
) -> dict[str, Any]:
    """Daily + rolling weekly usage for Mission Hub."""
    settings = get_settings()
    today = _utc_today()
    start = today - timedelta(days=days - 1)

    result = await db.execute(
        select(WorkspaceUsageDaily)
        .where(
            WorkspaceUsageDaily.workspace_id == workspace_id,
            WorkspaceUsageDaily.usage_date >= start,
            WorkspaceUsageDaily.usage_date <= today,
        )
        .order_by(WorkspaceUsageDaily.usage_date.asc())
    )
    rows = list(result.scalars().all())

    by_date = {r.usage_date: r for r in rows}
    daily_series: list[dict[str, Any]] = []
    category_totals: dict[str, float] = {}
    week_cost = 0.0
    week_artifacts = 0
    week_missions = 0

    for i in range(days):
        d = start + timedelta(days=i)
        row = by_date.get(d)
        cost = _to_float(row.cost_usd) if row else 0.0
        artifacts = row.artifact_count if row else 0
        missions = row.mission_count if row else 0
        breakdown = dict(row.breakdown or {}) if row else {}

        week_cost += cost
        week_artifacts += artifacts
        week_missions += missions
        for cat, amt in breakdown.items():
            category_totals[cat] = round(category_totals.get(cat, 0) + float(amt), 4)

        daily_series.append({
            "date": d.isoformat(),
            "cost_usd": round(cost, 4),
            "artifact_count": artifacts,
            "mission_count": missions,
            "breakdown": breakdown,
        })

    today_row = by_date.get(today)
    spent_today = _to_float(today_row.cost_usd) if today_row else 0.0
    daily_cap = settings.workspace_daily_budget_usd

    result: dict[str, Any] = {
        "workspace_id": str(workspace_id),
        "daily_budget_usd": daily_cap,
        "spent_today_usd": round(spent_today, 4),
        "remaining_today_usd": round(max(0.0, daily_cap - spent_today), 4),
        "week_cost_usd": round(week_cost, 4),
        "week_artifact_count": week_artifacts,
        "week_mission_count": week_missions,
        "week_days": days,
        "category_totals": category_totals,
        "daily_series": daily_series,
        "currency_note": "Tahmini API maliyeti (USD); gerçek fatura OpenAI/fal.ai/Apify'dan gelir.",
    }

    from app.services.ai_cost_service import ESTIMATED_COST_USD
    from app.services.token_billing_service import (
        CATEGORY_LABELS_TR,
        build_token_wallet_summary,
        get_month_cost_usd,
    )

    month_cost, month_tokens, month_categories = await get_month_cost_usd(db, workspace_id)
    result["month_cost_usd"] = month_cost
    result["month_tokens"] = month_tokens
    result["month_category_totals"] = month_categories
    result["category_labels"] = CATEGORY_LABELS_TR
    result["unit_cost_hints_usd"] = ESTIMATED_COST_USD

    if settings.token_billing_enabled:
        result["token_wallet"] = await build_token_wallet_summary(
            db,
            workspace_id,
            package_slug=package_slug,
            period_cost_usd=week_cost,
            period_days=days,
            category_totals=category_totals,
            spent_today_usd=spent_today,
        )

    return result
