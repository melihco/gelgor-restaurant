"""Production factory status — phase + block reason for Mission Hub."""

from __future__ import annotations

from typing import Any

# Heuristic: ~2 min per BullMQ batch at default worker settings.
_EST_MINUTES_PER_QUEUE_SLOT = 2.0
_PLATFORM_QUEUE_BUSY_THRESHOLD = 80


async def get_platform_queue_wait_depth() -> int | None:
    """BullMQ wait depth (best-effort; None when Redis unavailable)."""
    try:
        from redis.asyncio import Redis
        from redis.exceptions import RedisError

        from app.config import get_settings

        settings = get_settings()
        if not settings.redis_url:
            return None
        client = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        try:
            depth = await client.llen("bull:production-slots:wait")
            return int(depth) if depth is not None else None
        finally:
            await client.aclose()
    except Exception:
        return None


def _dominant_block_reason(slots: list[dict[str, Any]]) -> str | None:
    errors = [
        str(s.get("lastError") or s.get("last_error") or "").strip().lower()
        for s in slots
        if s.get("lastError") or s.get("last_error")
    ]
    if not errors:
        return None
    if any("budget" in e or "bütçe" in e or "limit" in e for e in errors):
        return "budget"
    if any("exhausted balance" in e or "fal.ai" in e or "403" in e for e in errors):
        return "provider_quota"
    if any("production_in_flight" in e or "mission_production" in e for e in errors):
        return "brand_in_flight"
    if any("bullmq" in e or "enqueue" in e for e in errors):
        return "platform_queue"
    return "unknown"


def resolve_production_phase(
    summary: dict[str, Any],
    *,
    manifest_required: int = 3,
    platform_queue_depth: int | None = None,
) -> dict[str, Any]:
    """Derive Hub-facing production phase from a mission_job_summary rollup."""
    total = int(summary.get("total") or 0)
    ready = int(summary.get("ready") or 0)
    in_flight = int(summary.get("inFlight") or summary.get("in_flight") or 0)
    queued = int(summary.get("queued") or 0)
    failed = int(summary.get("failed") or 0)
    complete = bool(summary.get("complete"))
    slots: list[dict[str, Any]] = list(summary.get("slots") or [])

    last_activity_at: str | None = None
    for row in slots:
        ts = row.get("updatedAt") or row.get("updated_at")
        if ts and (last_activity_at is None or str(ts) > last_activity_at):
            last_activity_at = str(ts)

    block_reason = _dominant_block_reason(slots)

    if total == 0:
        return {
            "phase": "idle",
            "blockReason": None,
            "platformQueueDepth": platform_queue_depth,
            "estimatedWaitMinutes": None,
            "lastActivityAt": last_activity_at,
        }

    if complete or ready >= total:
        phase = "complete"
        block_reason = None
    elif in_flight > 0:
        phase = "producing"
        block_reason = None
    elif ready > 0:
        phase = "partial"
        block_reason = None
    elif queued > 0 or failed > 0:
        phase = "queued"
        block_reason = _dominant_block_reason(slots)
        if block_reason is None and (
            platform_queue_depth is None
            or platform_queue_depth >= _PLATFORM_QUEUE_BUSY_THRESHOLD
        ):
            block_reason = "platform_queue"
    else:
        phase = "idle"
        block_reason = None

    depth = platform_queue_depth if platform_queue_depth is not None else 0
    backlog = max(depth, queued + in_flight)
    estimated: int | None = None
    if phase in ("queued", "producing") and backlog > 0:
        estimated = max(
            3,
            min(120, int(backlog * _EST_MINUTES_PER_QUEUE_SLOT)),
        )

    return {
        "phase": phase,
        "blockReason": block_reason,
        "platformQueueDepth": platform_queue_depth,
        "estimatedWaitMinutes": estimated,
        "lastActivityAt": last_activity_at,
    }


async def enrich_mission_job_summary(summary: dict[str, Any]) -> dict[str, Any]:
    """Attach phase / blockReason / ETA fields for Mission Hub."""
    depth = await get_platform_queue_wait_depth()
    phase_info = resolve_production_phase(summary, platform_queue_depth=depth)
    return {**summary, **phase_info}
