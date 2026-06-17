"""
Lightweight Redis cache layer.

Usage:
    from app.services.redis_cache import cache

    val = await cache.get_json("key")
    await cache.set_json("key", data, ttl=300)
    await cache.delete("key")
    await cache.delete_pattern("brand_context:*")

Design decisions:
- Single module-level Redis pool; created lazily on first use.
- All methods degrade gracefully to None/False when Redis is unavailable so
  callers can treat cache misses and Redis-down identically.
- TTL default = 300 s (5 min) — suits brand context and score aggregates.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from redis.asyncio import Redis, ConnectionPool
from redis.exceptions import RedisError

from app.config import get_settings

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _pool


def _client() -> Redis:
    return Redis(connection_pool=_get_pool())


class RedisCache:
    DEFAULT_TTL = 300  # 5 minutes

    async def get_json(self, key: str) -> Any | None:
        try:
            raw = await _client().get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except RedisError as e:
            logger.debug("redis get miss (unavailable): %s — %s", key, e)
            return None
        except json.JSONDecodeError:
            return None

    async def set_json(self, key: str, value: Any, ttl: int = DEFAULT_TTL) -> bool:
        try:
            await _client().setex(key, ttl, json.dumps(value, default=str))
            return True
        except RedisError as e:
            logger.debug("redis set failed: %s — %s", key, e)
            return False

    async def delete(self, *keys: str) -> int:
        if not keys:
            return 0
        try:
            return await _client().delete(*keys)
        except RedisError:
            return 0

    async def delete_pattern(self, pattern: str) -> int:
        try:
            r = _client()
            keys = await r.keys(pattern)
            if not keys:
                return 0
            return await r.delete(*keys)
        except RedisError:
            return 0

    async def ping(self) -> bool:
        try:
            return await _client().ping()
        except RedisError:
            return False


# Module-level singleton — import this everywhere.
cache = RedisCache()
