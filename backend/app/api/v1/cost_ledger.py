"""Cost ledger API — record line items + mission summaries (internal + admin)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, verify_internal_api_key
from app.services.cost_ledger_service import (
    record_artifact_cost_line,
    record_mission_cost_line,
    summarize_mission_cost_ledger,
)
from app.services.production_cost_service import (
    list_mission_cost_events,
    record_cost_event,
    summarize_mission_production_cost,
    summarize_workspace_production_cost,
)

router = APIRouter()


class MissionCostLineRequest(BaseModel):
    mission_id: uuid.UUID
    category: str = Field(max_length=64)
    amount_usd: float = Field(gt=0)
    source_system: str = Field(default="unknown", max_length=32)
    source_ref: str | None = Field(default=None, max_length=128)
    provider: str | None = Field(default=None, max_length=32)
    model: str | None = Field(default=None, max_length=64)
    tokens_in: int | None = None
    tokens_out: int | None = None
    cached_tokens: int | None = None
    idempotency_key: str | None = Field(default=None, max_length=192)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArtifactCostLineRequest(BaseModel):
    artifact_id: uuid.UUID
    category: str = Field(max_length=64)
    amount_usd: float = Field(gt=0)
    mission_id: uuid.UUID | None = None
    call_type: str | None = Field(default=None, max_length=64)
    source_system: str = Field(default="unknown", max_length=32)
    provider: str | None = Field(default=None, max_length=32)
    model: str | None = Field(default=None, max_length=64)
    slot_role: str | None = Field(default=None, max_length=64)
    idea_index: int | None = None
    pipeline: str | None = Field(default=None, max_length=64)
    attempt: int = Field(default=0, ge=0, le=100)
    idempotency_key: str | None = Field(default=None, max_length=192)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CostEventLineRequest(BaseModel):
    """Direct write to cost_events SSOT (preferred for new integrations)."""
    category: str = Field(max_length=64)
    amount_usd: float = Field(gt=0)
    mission_id: uuid.UUID | None = None
    artifact_id: uuid.UUID | None = None
    scope: str | None = Field(default=None, max_length=32)
    call_type: str | None = Field(default=None, max_length=64)
    slot_key: str | None = Field(default=None, max_length=96)
    idea_index: int | None = None
    slot_role: str | None = Field(default=None, max_length=64)
    pipeline: str | None = Field(default=None, max_length=64)
    attempt: int = Field(default=0, ge=0, le=100)
    source_system: str = Field(default="unknown", max_length=32)
    source_ref: str | None = Field(default=None, max_length=128)
    provider: str | None = Field(default=None, max_length=32)
    model: str | None = Field(default=None, max_length=64)
    pricing_basis: str | None = Field(default=None, max_length=32)
    tokens_in: int | None = None
    tokens_out: int | None = None
    cached_tokens: int | None = None
    external_request_id: str | None = Field(default=None, max_length=128)
    idempotency_key: str | None = Field(default=None, max_length=192)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RecordLedgerBatchRequest(BaseModel):
    mission_lines: list[MissionCostLineRequest] = Field(default_factory=list)
    artifact_lines: list[ArtifactCostLineRequest] = Field(default_factory=list)
    cost_events: list[CostEventLineRequest] = Field(default_factory=list)


@router.post("/{workspace_id}/ledger")
async def record_cost_ledger_batch(
    workspace_id: uuid.UUID,
    body: RecordLedgerBatchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_api_key),
):
    """Record one or more immutable cost lines (internal services only)."""
    mission_inserted = 0
    artifact_inserted = 0
    event_inserted = 0

    for line in body.mission_lines:
        ok = await record_mission_cost_line(
            db,
            workspace_id=workspace_id,
            mission_id=line.mission_id,
            category=line.category,
            amount_usd=line.amount_usd,
            source_system=line.source_system,
            source_ref=line.source_ref,
            provider=line.provider,
            model=line.model,
            tokens_in=line.tokens_in,
            tokens_out=line.tokens_out,
            cached_tokens=line.cached_tokens,
            idempotency_key=line.idempotency_key,
            metadata=line.metadata,
        )
        if ok:
            mission_inserted += 1

    for line in body.artifact_lines:
        ok = await record_artifact_cost_line(
            db,
            workspace_id=workspace_id,
            artifact_id=line.artifact_id,
            mission_id=line.mission_id,
            category=line.category,
            amount_usd=line.amount_usd,
            call_type=line.call_type,
            source_system=line.source_system,
            provider=line.provider,
            model=line.model,
            slot_role=line.slot_role,
            idea_index=line.idea_index,
            pipeline=line.pipeline,
            attempt=line.attempt,
            idempotency_key=line.idempotency_key,
            metadata=line.metadata,
        )
        if ok:
            artifact_inserted += 1

    for line in body.cost_events:
        ok = await record_cost_event(
            db,
            workspace_id=workspace_id,
            mission_id=line.mission_id,
            artifact_id=line.artifact_id,
            category=line.category,
            amount_usd=line.amount_usd,
            scope=line.scope,
            call_type=line.call_type,
            slot_key=line.slot_key,
            idea_index=line.idea_index,
            slot_role=line.slot_role,
            pipeline=line.pipeline,
            attempt=line.attempt,
            source_system=line.source_system,
            source_ref=line.source_ref,
            provider=line.provider,
            model=line.model,
            pricing_basis=line.pricing_basis,
            tokens_in=line.tokens_in,
            tokens_out=line.tokens_out,
            cached_tokens=line.cached_tokens,
            external_request_id=line.external_request_id,
            idempotency_key=line.idempotency_key,
            metadata=line.metadata,
        )
        if ok:
            event_inserted += 1

    return {
        "workspace_id": str(workspace_id),
        "mission_lines_inserted": mission_inserted,
        "artifact_lines_inserted": artifact_inserted,
        "cost_events_inserted": event_inserted,
    }


@router.get("/{workspace_id}/workspace/summary")
async def get_workspace_production_cost_summary(
    workspace_id: uuid.UUID,
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Workspace-level cost rollup for admin dashboard."""
    return await summarize_workspace_production_cost(db, workspace_id, days=days)


@router.get("/{workspace_id}/missions/{mission_id}/summary")
async def get_mission_cost_ledger_summary(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mission + feed artifact cost breakdown (legacy ledger + rollups)."""
    summary = await summarize_mission_cost_ledger(db, mission_id)
    summary["workspace_id"] = str(workspace_id)
    return summary


@router.get("/{workspace_id}/missions/{mission_id}/production")
async def get_mission_production_cost_summary(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mission cost from rollups + slot breakdown (admin SSOT)."""
    summary = await summarize_mission_production_cost(db, mission_id)
    summary["workspace_id"] = str(workspace_id)
    return summary


@router.get("/{workspace_id}/missions/{mission_id}/slots")
async def get_mission_slot_cost_rollups(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Per-slot cost rollups for feed production."""
    summary = await summarize_mission_production_cost(db, mission_id)
    return {
        "workspace_id": str(workspace_id),
        "mission_id": str(mission_id),
        "slots": summary.get("slots") or [],
        "slot_count": summary.get("slot_count") or 0,
        "total_usd": summary.get("total_usd") or 0,
    }


@router.get("/{workspace_id}/missions/{mission_id}/events")
async def get_mission_cost_events(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Paginated atomic cost events for mission drill-down."""
    result = await list_mission_cost_events(db, mission_id, limit=limit, offset=offset)
    result["workspace_id"] = str(workspace_id)
    return result
