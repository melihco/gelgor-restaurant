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
    "feed_cohesion_review": "feed_art_director",
    "visual_design_cards": "scene_brief",
    "content_calendar": "content_ideation",
}

# Approximate cost per 1K tokens (input/output blended) by model family
_MODEL_COST_PER_1K_TOKENS: dict[str, float] = {
    "gpt-4o": 0.0075,
    "gpt-4o-mini": 0.0003,
    "gpt-4.1": 0.008,
    "gpt-4.1-mini": 0.0006,
    "claude-3-5-sonnet": 0.009,
    "claude-sonnet-4": 0.009,
    "default": 0.006,
}


def estimate_cost_from_tokens(tokens_used: int, model: str = "") -> float:
    """Compute USD cost from actual token count and model identifier."""
    if tokens_used <= 0:
        return 0.0
    model_lower = (model or "").lower()
    rate = _MODEL_COST_PER_1K_TOKENS["default"]
    for prefix, cost in _MODEL_COST_PER_1K_TOKENS.items():
        if prefix != "default" and prefix in model_lower:
            rate = cost
            break
    return round((tokens_used / 1000) * rate, 4)


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
    *,
    source_system: str = "python_crew",
    source_ref: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    cached_tokens: int | None = None,
    idempotency_key: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Merge category spend into mission.performance_summary.ai_cost_breakdown."""
    if amount_usd <= 0:
        return
    r = await db.execute(
        select(Mission.performance_summary, Mission.workspace_id).where(Mission.id == mission_id)
    )
    row = r.one_or_none()
    if not row:
        return
    perf_summary, workspace_id = row[0], row[1]
    summary = dict(perf_summary or {})
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

    try:
        from app.services.cost_ledger_service import record_mission_cost_line

        ledger_key = idempotency_key or f"mission:{mission_id}:{category}:{breakdown['updated_at']}"
        await record_mission_cost_line(
            db,
            workspace_id=workspace_id,
            mission_id=mission_id,
            category=category,
            amount_usd=amount_usd,
            source_system=source_system,
            source_ref=source_ref,
            provider=provider,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cached_tokens=cached_tokens,
            idempotency_key=ledger_key,
            metadata=metadata or {},
        )
    except Exception as exc:
        logger.warning(
            "mission_cost_ledger_append_failed",
            mission_id=str(mission_id),
            category=category,
            error=str(exc)[:200],
        )


async def record_mission_task_ai_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    task_type: str,
    *,
    tokens_used: int = 0,
    model: str = "",
) -> None:
    """Record graph node LLM cost to workspace + mission.

    If tokens_used is provided, computes actual cost from model pricing.
    Otherwise falls back to the static estimate table.
    """
    category = TASK_TYPE_TO_CATEGORY.get(task_type)
    if not category:
        return
    amount = estimate_cost_from_tokens(tokens_used, model) if tokens_used > 0 else ESTIMATED_COST_USD.get(category, 0.05)
    await record_workspace_ai_cost(db, workspace_id, category, amount)
    await append_mission_ai_cost(
        db,
        mission_id,
        category,
        amount,
        source_system="python_crew",
        source_ref=task_type,
        provider="openai" if model else None,
        model=model or None,
        tokens_in=tokens_used if tokens_used > 0 else None,
        idempotency_key=f"graph:{mission_id}:{task_type}:{tokens_used}:{model}",
    )
    logger.info(
        "mission_task_ai_cost_recorded",
        mission_id=str(mission_id),
        task_type=task_type,
        category=category,
        amount_usd=amount,
        tokens_used=tokens_used or "estimate",
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
