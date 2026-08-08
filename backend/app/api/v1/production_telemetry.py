"""Production-line telemetry API — live jobs, timing, cost join for platform screens."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import verify_internal_api_key
from app.services.production_line_telemetry_service import (
    list_job_events,
    summarize_mission_production_line,
    summarize_workspace_production_line,
)

router = APIRouter()


@router.get("/{workspace_id}/live")
async def workspace_production_line_live(
    workspace_id: uuid.UUID,
    lookback_hours: int = Query(default=24, ge=1, le=168),
    _: None = Depends(verify_internal_api_key),
):
    """Live board + period averages (duration, queue wait, cost from cost_events)."""
    return await summarize_workspace_production_line(
        workspace_id,
        lookback_hours=lookback_hours,
    )


@router.get("/{workspace_id}/missions/{mission_id}")
async def mission_production_line(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    _: None = Depends(verify_internal_api_key),
):
    """Per-mission slot timing, success rate, recent lifecycle events, cost join."""
    summary = await summarize_mission_production_line(mission_id)
    summary["workspace_id"] = str(workspace_id)
    return summary


@router.get("/{workspace_id}/jobs/{job_id}/events")
async def job_production_events(
    workspace_id: uuid.UUID,
    job_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    _: None = Depends(verify_internal_api_key),
):
    events = await list_job_events(job_id, limit=limit)
    return {
        "workspace_id": str(workspace_id),
        "job_id": str(job_id),
        "events": events,
    }
