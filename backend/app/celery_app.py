"""
Celery application — distributed orchestration for production work.

Replaces the in-process APScheduler + ``asyncio.Task`` debounce dicts so multiple
replicas coordinate periodic draining, mission advancement, and content execution.

Async bridge
------------
The codebase is fully async (asyncpg, httpx). Celery prefork workers run one task
at a time per child process, so each worker process keeps a SINGLE persistent
event loop and runs coroutines on it via :func:`run_async`. This keeps the
asyncpg connection pool bound to one stable loop for the life of the worker
(creating a new loop per task via ``asyncio.run`` would break the shared engine
pool in :mod:`app.database`).

Queues
------
- ``drain``   — production factory draining (slot production).
- ``advance`` — mission task-graph advancement + cadence.
- ``content`` — content-agent crew execution + heavy syntheses.

Run (dev, one worker for all queues)::

    celery -A app.celery_app worker -Q drain,advance,content --concurrency=4
    celery -A app.celery_app beat

Run (prod, isolated workers)::

    celery -A app.celery_app worker -Q drain   --concurrency=16 -n drain@%h
    celery -A app.celery_app worker -Q advance --concurrency=8  -n advance@%h
    celery -A app.celery_app worker -Q content --concurrency=4  -n content@%h
"""

from __future__ import annotations

import asyncio
from typing import Any, Coroutine, TypeVar

import structlog
from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

celery_app = Celery(
    "smartagency",
    broker=settings.effective_celery_broker_url,
    backend=settings.effective_celery_result_backend,
    include=[
        "app.tasks.drain_tasks",
        "app.tasks.advance_tasks",
        "app.tasks.content_tasks",
        "app.tasks.cadence_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Reliability: ack only after the task finishes so a crashed worker re-queues.
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Don't let results pile up in Redis forever.
    result_expires=3600,
    # Route tasks to dedicated queues.
    task_routes={
        "app.tasks.drain_tasks.*": {"queue": "drain"},
        "app.tasks.advance_tasks.*": {"queue": "advance"},
        "app.tasks.cadence_tasks.*": {"queue": "advance"},
        "app.tasks.content_tasks.*": {"queue": "content"},
    },
    task_default_queue="advance",
)

# ── Beat schedule ────────────────────────────────────────────────────────────
# Mirrors the production-relevant APScheduler jobs. Daily intelligence jobs (brand
# DNA, social listening, market intel) remain on APScheduler for now; this schedule
# covers the high-frequency production loop that must scale horizontally.
celery_app.conf.beat_schedule = {
    "drain-all-open-missions": {
        "task": "app.tasks.drain_tasks.drain_all_open_missions",
        "schedule": 120.0,  # every 2 minutes
        "options": {"queue": "drain"},
    },
    "advance-all-active-missions": {
        "task": "app.tasks.advance_tasks.advance_all_active_missions",
        "schedule": 180.0,  # every 3 minutes
        "options": {"queue": "advance"},
    },
    "process-due-scheduled-posts": {
        "task": "app.tasks.advance_tasks.process_due_scheduled_posts",
        "schedule": 300.0,  # every 5 minutes
        "options": {"queue": "advance"},
    },
    "mission-cadence-dry-run": {
        "task": "app.tasks.cadence_tasks.cadence_dry_run_all",
        "schedule": crontab(hour=7, minute=30),
        "options": {"queue": "advance"},
    },
}


# ── Async bridge ──────────────────────────────────────────────────────────────
_T = TypeVar("_T")
_worker_loop: asyncio.AbstractEventLoop | None = None


def _get_worker_loop() -> asyncio.AbstractEventLoop:
    """Return this worker process's persistent event loop (created on first use)."""
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_loop)
    return _worker_loop


def run_async(coro: Coroutine[Any, Any, _T]) -> _T:
    """Run an async coroutine to completion on the worker's persistent loop."""
    loop = _get_worker_loop()
    return loop.run_until_complete(coro)
