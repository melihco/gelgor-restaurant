"""
Internal production-jobs callback API.

The Next.js BullMQ worker calls ``/internal/v1/production-jobs/complete`` after it
executes a claimed slot batch, so Python can mark each ``production_jobs`` row
ready/failed by slot key and re-sync mission state. Authenticated via the shared
internal API key.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import verify_internal_api_key

logger = structlog.get_logger()

router = APIRouter(dependencies=[Depends(verify_internal_api_key)])


class FactoryJobRef(BaseModel):
    id: str
    slotKey: str = ""


class ProductionJobCompleteRequest(BaseModel):
    mission_id: str
    workspace_id: str
    factory_jobs: list[FactoryJobRef] = Field(default_factory=list)
    produce_data: dict | None = None
    http_status: int | None = None


@router.post("/complete")
async def complete_production_jobs(request: ProductionJobCompleteRequest) -> dict:
    from app.services.production_factory_service import apply_bullmq_completion

    try:
        mission_id = uuid.UUID(request.mission_id)
        workspace_id = uuid.UUID(request.workspace_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="invalid mission_id/workspace_id")

    factory_jobs = [fj.model_dump() for fj in request.factory_jobs]
    result = await apply_bullmq_completion(
        mission_id,
        workspace_id,
        factory_jobs,
        request.produce_data,
    )
    return {"ok": True, **result}
