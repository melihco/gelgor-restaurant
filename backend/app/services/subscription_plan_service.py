"""Resolve tenant subscription plan slug from Nexus API."""

from __future__ import annotations

import structlog

from app.config import get_settings

logger = structlog.get_logger()

_cache: dict[str, tuple[str | None, float]] = {}
_CACHE_TTL_SECONDS = 3600.0


async def resolve_workspace_plan_slug(workspace_id: str) -> str | None:
    """Fetch packageSlug from Nexus /api/packages/usage (cached 1h)."""
    import time

    ws = str(workspace_id or "").strip()
    if not ws:
        return None

    now = time.monotonic()
    cached = _cache.get(ws)
    if cached and cached[1] > now:
        return cached[0]

    settings = get_settings()
    base = str(getattr(settings, "nexus_api_url", "http://localhost:5050")).rstrip("/")
    slug: str | None = None
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"{base}/api/packages/usage",
                headers={"X-Tenant-Id": ws},
            )
            if res.is_success:
                data = res.json()
                raw = str(data.get("packageSlug") or data.get("package_slug") or "").strip().lower()
                slug = raw or None
    except Exception as exc:
        logger.warning(
            "subscription_plan_fetch_failed",
            workspace_id=ws,
            error=str(exc)[:200],
        )

    _cache[ws] = (slug, now + _CACHE_TTL_SECONDS)
    return slug
