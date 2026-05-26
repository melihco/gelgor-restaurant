"""Workspace API usage cost — daily budget + weekly summary."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, verify_internal_api_key
from app.services.usage_cost_service import (
    check_budget,
    get_usage_summary,
    record_cost,
)

router = APIRouter()


class RecordUsageRequest(BaseModel):
    amount_usd: float = Field(gt=0, description="Estimated USD cost")
    category: str = Field(default="other", max_length=64)
    artifact_count: int = Field(default=0, ge=0)
    mission_count: int = Field(default=0, ge=0)


@router.get("/{workspace_id}")
async def get_workspace_usage_cost(
    workspace_id: uuid.UUID,
    days: int = 7,
    package_slug: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Daily and weekly cost summary + token wallet for profile UI."""
    if days < 1 or days > 30:
        raise HTTPException(400, "days must be between 1 and 30")
    return await get_usage_summary(db, workspace_id, days=days, package_slug=package_slug)


@router.get("/{workspace_id}/estimate")
async def estimate_action_tokens(
    workspace_id: uuid.UUID,
    cost_usd: float = 0.04,
):
    """Pre-flight token estimate before mission / auto-produce."""
    from app.services.token_billing_service import estimate_tokens_before_action
    return estimate_tokens_before_action(cost_usd)


@router.get("/{workspace_id}/budget-check")
async def budget_check(
    workspace_id: uuid.UUID,
    additional_cost_usd: float = 0.0,
    db: AsyncSession = Depends(get_db),
):
    """Check if workspace can spend more today (used by auto-produce BFF)."""
    return await check_budget(db, workspace_id, additional_cost_usd)


@router.post("/{workspace_id}/record")
async def record_workspace_usage(
    workspace_id: uuid.UUID,
    body: RecordUsageRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_api_key),
):
    """Record estimated cost — internal services only."""
    row = await record_cost(
        db,
        workspace_id,
        body.amount_usd,
        body.category,
        artifact_count=body.artifact_count,
        mission_count=body.mission_count,
    )
    return {
        "workspace_id": str(workspace_id),
        "usage_date": row.usage_date.isoformat(),
        "cost_usd": float(row.cost_usd),
        "artifact_count": row.artifact_count,
        "mission_count": row.mission_count,
        "breakdown": row.breakdown,
    }
