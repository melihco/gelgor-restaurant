"""
Celery advance tasks — mission task-graph advancement + scheduled posts.

``advance_all_active_missions`` (Beat, every 3 min) advances every active mission's
task graph (initial trigger, recovery, staleness detection). ``advance_mission``
advances a single mission and can be dispatched on demand (e.g. after a node
completes) to progress continuously rather than waiting for the next tick.
"""

from __future__ import annotations

import uuid

import structlog

from app.celery_app import celery_app, run_async

logger = structlog.get_logger()


@celery_app.task(name="app.tasks.advance_tasks.advance_all_active_missions")
def advance_all_active_missions() -> dict:
    """Beat entry: advance all approved/in_flight missions + reconcile factory gaps."""
    return run_async(_advance_all_active_missions_async())


async def _advance_all_active_missions_async() -> dict:
    from app.services.task_graph_executor import advance_all_active_missions as _advance

    result = await _advance()
    if result.get("checked", 0) > 0:
        logger.info("celery.advance_all_done", **result)
    return result


@celery_app.task(
    name="app.tasks.advance_tasks.advance_mission",
    bind=True,
    acks_late=True,
    max_retries=2,
    default_retry_delay=30,
)
def advance_mission(self, mission_id: str, workspace_id: str) -> dict:
    """Advance a single mission's task graph (on-demand or post-node-completion)."""
    return run_async(_advance_mission_async(mission_id, workspace_id))


async def _advance_mission_async(mission_id: str, workspace_id: str) -> dict:
    from app.services.redis_lock import distributed_lock
    from app.services.task_graph_executor import advance_mission as _advance_one

    mid = uuid.UUID(mission_id)
    wid = uuid.UUID(workspace_id)
    # Guard so two replicas don't advance the same mission's graph concurrently.
    async with distributed_lock(f"advance:{mid}", ttl_sec=300) as acquired:
        if not acquired:
            return {"skipped": "locked", "mission_id": mission_id}
        launched = await _advance_one(mid, wid)
        return {"mission_id": mission_id, "launched": launched}


@celery_app.task(
    name="app.tasks.advance_tasks.ensure_mission_feed",
    bind=True,
    acks_late=True,
    max_retries=2,
    default_retry_delay=30,
)
def ensure_mission_feed(
    self,
    mission_id: str,
    workspace_id: str,
    operator_initiated: bool = False,
) -> dict:
    """Ensure a mission's feed package is produced (ideation/calendar/cohesion → drain)."""
    return run_async(
        _ensure_mission_feed_async(mission_id, workspace_id, operator_initiated),
    )


async def _ensure_mission_feed_async(
    mission_id: str,
    workspace_id: str,
    operator_initiated: bool = False,
) -> dict:
    from app.services.mission_feed_production_service import ensure_mission_feed_production
    from app.services.redis_lock import distributed_lock

    mid = uuid.UUID(mission_id)
    wid = uuid.UUID(workspace_id)
    async with distributed_lock(f"ensure:{mid}", ttl_sec=900) as acquired:
        if not acquired:
            return {"skipped": "locked", "mission_id": mission_id}
        await ensure_mission_feed_production(
            mid,
            wid,
            operator_initiated=operator_initiated,
        )
        return {"mission_id": mission_id, "ok": True}


@celery_app.task(name="app.tasks.advance_tasks.process_due_scheduled_posts")
def process_due_scheduled_posts() -> dict:
    """Beat entry: publish all scheduled posts whose time has come."""
    return run_async(_process_due_scheduled_posts_async())


async def _process_due_scheduled_posts_async() -> dict:
    from app.database import async_session_factory
    from app.services.post_scheduler_service import process_due_posts

    async with async_session_factory() as db:
        result = await process_due_posts(db)
    if result.get("processed", 0) > 0:
        logger.info("celery.scheduled_posts_processed", **result)
    return result
