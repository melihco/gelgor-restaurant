"""
Celery drain tasks — production factory slot draining.

``drain_all_open_missions`` (Beat, every 2 min) fans out one ``drain_mission`` task
per mission with runnable jobs, enforcing per-workspace concurrency. Each
``drain_mission`` claims a batch of slots and produces them via the Next.js
executor, guarded by a cross-replica Redis lock so the same mission never drains
twice concurrently.
"""

from __future__ import annotations

import uuid

import structlog

from app.celery_app import celery_app, run_async

logger = structlog.get_logger()


@celery_app.task(
    name="app.tasks.drain_tasks.drain_mission",
    bind=True,
    acks_late=True,
    max_retries=3,
    default_retry_delay=60,
)
def drain_mission(self, mission_id: str, workspace_id: str) -> dict:
    """Drain one mission's runnable slots (one Celery task = one drain pass)."""
    return run_async(_drain_mission_async(mission_id, workspace_id))


async def _drain_mission_async(mission_id: str, workspace_id: str) -> dict:
    from app.services import production_factory_service as pf
    from app.services.redis_lock import distributed_lock

    mid = uuid.UUID(mission_id)
    wid = uuid.UUID(workspace_id)

    async with distributed_lock(f"drain:{mid}", ttl_sec=pf._DRAIN_LOCK_TTL_SEC) as acquired:
        if not acquired:
            logger.debug("celery.drain_mission_skipped_locked", mission_id=mission_id)
            return {"skipped": "locked", "mission_id": mission_id}
        result = await pf.drain_production_jobs(mid, wid)
        logger.info("celery.drain_mission_done", mission_id=mission_id, **result)
        return {"mission_id": mission_id, **result}


@celery_app.task(name="app.tasks.drain_tasks.drain_all_open_missions")
def drain_all_open_missions(limit: int = 50) -> dict:
    """Beat entry: dispatch a drain task per open mission (per-workspace capped)."""
    return run_async(_drain_all_open_missions_async(limit))


async def _drain_all_open_missions_async(limit: int) -> dict:
    from app.config import get_settings
    from app.services import production_factory_service as pf
    from app.services import production_job_service as jobs

    settings = get_settings()
    max_per_ws = settings.production_max_concurrent_per_workspace

    mission_ids = await jobs.list_missions_with_open_jobs(limit=limit)
    dispatched = 0
    ws_counts: dict[str, int] = {}

    for mid in mission_ids:
        workspace_id = await pf._workspace_for_mission(uuid.UUID(mid))
        if not workspace_id:
            continue
        ws_key = str(workspace_id)
        current = ws_counts.get(ws_key, 0)
        if current >= max_per_ws:
            continue
        ws_counts[ws_key] = current + 1
        drain_mission.apply_async(args=[mid, str(workspace_id)], queue="drain")
        dispatched += 1

    if dispatched:
        logger.info("celery.drain_all_open_dispatched", missions=dispatched)
    return {"dispatched": dispatched}
