"""
Shared execution lock registry.

The content_agent cannot run two concurrent crews for the same tenant —
parallel to_thread kickoffs in one process cause stuck runs (0 tokens).

This module holds the authoritative per-tenant lock dictionary so that
BOTH the internal HTTP orchestration path (.NET → Python) AND the
TaskGraphExecutor (scheduler path) share the same locks and never
deadlock each other.

Usage:
    lock = await get_content_lock(tenant_id)
    async with lock:
        result = await run_crew(...)
"""

from __future__ import annotations

import asyncio

# Module-level singletons — one lock per tenant, created on first access.
_content_locks: dict[str, asyncio.Lock] = {}
_registry_lock = asyncio.Lock()


async def get_content_lock(tenant_id: str) -> asyncio.Lock:
    """Return (or lazily create) the per-tenant asyncio.Lock for content_agent."""
    async with _registry_lock:
        if tenant_id not in _content_locks:
            _content_locks[tenant_id] = asyncio.Lock()
        return _content_locks[tenant_id]
