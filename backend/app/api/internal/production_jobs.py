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
        http_status=request.http_status,
    )
    return {"ok": True, **result}


class RequeueBillingRequest(BaseModel):
    workspace_id: str | None = None
    lookback_hours: int = 72
    limit: int = 200
    kick_drain: bool = True


@router.post("/requeue-billing")
async def requeue_billing_exhausted(request: RequeueBillingRequest) -> dict:
    """Revive billing/quota-exhausted factory jobs after circuits are cleared."""
    from app.services import production_job_service as pj
    from app.services.production_factory_service import schedule_drain

    workspace_id: uuid.UUID | None = None
    if request.workspace_id:
        try:
            workspace_id = uuid.UUID(request.workspace_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="invalid workspace_id")

    pairs = await pj.requeue_billing_exhausted_recent(
        workspace_id=workspace_id,
        lookback_hours=max(1, min(int(request.lookback_hours), 168)),
        limit=max(1, min(int(request.limit), 500)),
    )
    kicked = 0
    if request.kick_drain:
        for mission_id_s, workspace_id_s in pairs:
            try:
                mid = uuid.UUID(mission_id_s)
                wid = uuid.UUID(workspace_id_s)
            except (ValueError, TypeError):
                continue
            await pj.reclaim_inflight_jobs(mid)
            schedule_drain(mid, wid, delay_sec=0.0, force=True, bypass_throttle=True)
            kicked += 1
    return {
        "ok": True,
        "requeuedMissions": len(pairs),
        "kicked": kicked,
        "missions": [{"missionId": m, "workspaceId": w} for m, w in pairs[:40]],
    }
