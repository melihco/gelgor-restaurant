"""
Shared execution lock registry.

The content_agent cannot run two concurrent crews for the same tenant —
parallel to_thread kickoffs in one process cause stuck runs (0 tokens), and
parallel crews across *replicas* cause duplicate spend + race conditions.

This module provides a HYBRID lock:

1. A process-local ``asyncio.Lock`` — prevents two coroutines in the SAME
   process from kicking off ``asyncio.to_thread`` crews concurrently.
2. A Redis distributed lock — prevents two DIFFERENT replicas (FastAPI app +
   Celery workers) from running the same tenant's content crew at once.

Both the internal HTTP orchestration path (.NET → Python) AND the
TaskGraphExecutor (scheduler / Celery path) share these locks.

Usage (preferred)::

    async with content_agent_lock(tenant_id):
        result = await run_crew(...)

Legacy (in-process only — kept for backward compatibility)::

    lock = await get_content_lock(tenant_id)
    async with lock:
        result = await run_crew(...)
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import AsyncIterator

from app.config import get_settings
from app.services.redis_lock import redis_lock

# Module-level singletons — one in-process lock per tenant, created on first access.
_content_locks: dict[str, asyncio.Lock] = {}
_registry_lock = asyncio.Lock()


async def get_content_lock(tenant_id: str) -> asyncio.Lock:
    """Return (or lazily create) the per-tenant in-process asyncio.Lock.

    NOTE: in-process only. For cross-replica safety prefer ``content_agent_lock``.
    """
    async with _registry_lock:
        if tenant_id not in _content_locks:
            _content_locks[tenant_id] = asyncio.Lock()
        return _content_locks[tenant_id]


def _content_lock_key(tenant_id: str) -> str:
    return f"content_agent:{tenant_id}"


@contextlib.asynccontextmanager
async def content_agent_lock(tenant_id: str) -> AsyncIterator[None]:
    """Serialize content_agent execution per tenant across processes AND replicas.

    Acquires the in-process asyncio.Lock first (fast, fair), then the Redis
    distributed lock (cross-replica). Blocks until both are held. Degrades to
    in-process-only when Redis is unavailable.
    """
    settings = get_settings()
    # Crew runs can take up to crew_execution_timeout_seconds; give the lock TTL
    # headroom so it auto-expires if a worker dies mid-run, but never before a
    # legitimately long run completes.
    ttl = int(settings.crew_execution_timeout_seconds) + 120
    wait_timeout = ttl  # callers serialize; wait roughly one full run

    in_proc = await get_content_lock(tenant_id)
    async with in_proc:
        token = await redis_lock.acquire_blocking(
            _content_lock_key(tenant_id),
            ttl_sec=ttl,
            wait_timeout_sec=wait_timeout,
        )
        try:
            yield
        finally:
            await redis_lock.release(_content_lock_key(tenant_id), token)
