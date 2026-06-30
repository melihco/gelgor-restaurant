"""
Celery cadence tasks — mission cadence evaluation telemetry.

``cadence_dry_run_all`` (Beat, daily 07:30 UTC) evaluates every workspace and logs
whether it should propose a new mission based on plan quota. Actual proposal stays
gated by ``AUTONOMOUS_MISSION_CADENCE_ENABLED``.
"""

from __future__ import annotations

import structlog

from app.celery_app import celery_app, run_async

logger = structlog.get_logger()


@celery_app.task(name="app.tasks.cadence_tasks.cadence_dry_run_all")
def cadence_dry_run_all() -> dict:
    """Beat entry: evaluate cadence for all workspaces (telemetry only)."""
    return run_async(_cadence_dry_run_all_async())


async def _cadence_dry_run_all_async() -> dict:
    from app.services.mission_cadence_service import cadence_dry_run_all as _dry_run

    results = await _dry_run()
    return {"evaluated": len(results or [])}
