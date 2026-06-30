"""
Redis-backed distributed locks (Redlock-lite, single-node).

Replaces the process-local ``asyncio.Lock`` / debounce dicts so that multiple
Python replicas (Celery workers + the FastAPI app) coordinate on the same key.

Design decisions
-----------------
- Uses the same ``redis.asyncio`` pool as :mod:`app.services.redis_cache`.
- ``acquire`` is ``SET key token NX EX ttl`` — atomic, returns a token on success.
- ``release`` / ``extend`` use Lua scripts so a holder only mutates *its own* lock
  (token check), never one re-acquired by another worker after a TTL expiry.
- Degrades gracefully when Redis is unavailable: ``acquire`` returns a synthetic
  token (best-effort, behaves like a no-op lock) so single-node dev without Redis
  keeps working. Multi-replica safety requires Redis to actually be reachable.

Usage::

    from app.services.redis_lock import distributed_lock

    async with distributed_lock("content_agent:" + tenant_id, ttl_sec=600) as acquired:
        if not acquired:
            return  # someone else holds it
        ...

Or manual::

    token = await redis_lock.acquire(key, ttl_sec=300)
    if token:
        try:
            ...
        finally:
            await redis_lock.release(key, token)
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from typing import AsyncIterator

from redis.asyncio import Redis, ConnectionPool
from redis.exceptions import RedisError

from app.config import get_settings

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None

# Lua: delete the key only if its value matches the token we hold.
_RELEASE_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""

# Lua: extend TTL only if the key still holds our token.
_EXTEND_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
else
    return 0
end
"""

# Sentinel token returned when Redis is unavailable (degraded no-op lock).
_DEGRADED_TOKEN = "__degraded_no_redis__"

_NAMESPACE = "lock:"


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _pool


def _client() -> Redis:
    return Redis(connection_pool=_get_pool())


def _key(name: str) -> str:
    return f"{_NAMESPACE}{name}"


class RedisDistributedLock:
    """Atomic distributed lock primitives over Redis."""

    async def acquire(self, name: str, ttl_sec: int = 300) -> str | None:
        """Try to acquire ``name``. Returns an opaque token on success, else ``None``.

        When Redis is unreachable, returns a degraded sentinel token so the caller
        proceeds (single-node best effort). Multi-replica mutual exclusion requires
        a reachable Redis.
        """
        token = uuid.uuid4().hex
        try:
            ok = await _client().set(_key(name), token, nx=True, ex=ttl_sec)
            return token if ok else None
        except RedisError as exc:
            logger.warning("redis_lock acquire degraded (redis down): %s — %s", name, exc)
            return _DEGRADED_TOKEN

    async def release(self, name: str, token: str | None) -> bool:
        """Release ``name`` only if we still hold ``token``."""
        if not token or token == _DEGRADED_TOKEN:
            return True
        try:
            result = await _client().eval(_RELEASE_LUA, 1, _key(name), token)
            return bool(result)
        except RedisError as exc:
            logger.debug("redis_lock release failed: %s — %s", name, exc)
            return False

    async def extend(self, name: str, token: str | None, ttl_sec: int) -> bool:
        """Extend the TTL of ``name`` only if we still hold ``token``."""
        if not token or token == _DEGRADED_TOKEN:
            return False
        try:
            result = await _client().eval(
                _EXTEND_LUA, 1, _key(name), token, str(int(ttl_sec * 1000))
            )
            return bool(result)
        except RedisError as exc:
            logger.debug("redis_lock extend failed: %s — %s", name, exc)
            return False

    async def acquire_blocking(
        self,
        name: str,
        ttl_sec: int = 300,
        wait_timeout_sec: float = 600.0,
        poll_interval_sec: float = 0.5,
    ) -> str | None:
        """Block (polling) until the lock is acquired or ``wait_timeout_sec`` elapses.

        Use for serialization semantics (callers must run sequentially, not skip).
        Returns the token on success, ``None`` on timeout.
        """
        deadline = asyncio.get_event_loop().time() + wait_timeout_sec
        backoff = poll_interval_sec
        while True:
            token = await self.acquire(name, ttl_sec=ttl_sec)
            if token is not None:
                return token
            if asyncio.get_event_loop().time() >= deadline:
                return None
            await asyncio.sleep(min(backoff, 2.0))
            backoff = min(backoff * 1.5, 2.0)

    async def is_held(self, name: str) -> bool:
        """True if the lock currently exists (held by anyone)."""
        try:
            return bool(await _client().exists(_key(name)))
        except RedisError:
            return False


# Module-level singleton — import this everywhere.
redis_lock = RedisDistributedLock()


@contextlib.asynccontextmanager
async def distributed_lock(name: str, ttl_sec: int = 300) -> AsyncIterator[bool]:
    """Async context manager. Yields ``True`` if the lock was acquired, else ``False``.

    The lock is always released on exit (if it was acquired by us).
    """
    token = await redis_lock.acquire(name, ttl_sec=ttl_sec)
    acquired = token is not None
    try:
        yield acquired
    finally:
        if acquired:
            await redis_lock.release(name, token)
