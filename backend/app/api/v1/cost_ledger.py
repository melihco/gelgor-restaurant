"""Cost ledger API — record line items + mission summaries (internal + admin)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, verify_internal_api_key
from app.services.cost_ledger_service import (
    record_artifact_cost_line,
    record_mission_cost_line,
    summarize_mission_cost_ledger,
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
    idempotency_key: str | None = Field(default=None, max_length=160)
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
    idempotency_key: str | None = Field(default=None, max_length=160)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RecordLedgerBatchRequest(BaseModel):
    mission_lines: list[MissionCostLineRequest] = Field(default_factory=list)
    artifact_lines: list[ArtifactCostLineRequest] = Field(default_factory=list)


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

    return {
        "workspace_id": str(workspace_id),
        "mission_lines_inserted": mission_inserted,
        "artifact_lines_inserted": artifact_inserted,
    }


@router.get("/{workspace_id}/missions/{mission_id}/summary")
async def get_mission_cost_ledger_summary(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mission + feed artifact cost breakdown from immutable ledger."""
    summary = await summarize_mission_cost_ledger(db, mission_id)
    summary["workspace_id"] = str(workspace_id)
    return summary
