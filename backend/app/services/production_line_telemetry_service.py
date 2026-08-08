"""Production-line telemetry — lifecycle events + mission/workspace summaries.

Cost stays in ``cost_events``; this service records *what the line is doing* and
how long stages take, then joins cost for platform screens.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy import text

logger = structlog.get_logger(__name__)

VALID_EVENT_TYPES = frozenset({
    "queued",
    "claimed",
    "running",
    "ready",
    "failed",
    "exhausted",
    "deferred",
    "skipped",
})


def _get_session_factory():
    from app.services.production_bridge import get_session_factory

    return get_session_factory()


def _as_uuid(value: Any) -> uuid.UUID | None:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _ms_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return None
    return max(0, n)


async def record_slot_event(
    *,
    job_id: str | uuid.UUID,
    workspace_id: str | uuid.UUID,
    mission_id: str | uuid.UUID,
    event_type: str,
    status: str | None = None,
    idea_index: int | None = None,
    slot_role: str | None = None,
    slot_key: str | None = None,
    format: str | None = None,
    pipeline: str | None = None,
    attempt: int | None = None,
    queue_wait_ms: int | None = None,
    duration_ms: int | None = None,
    provider: str | None = None,
    model: str | None = None,
    artifact_id: str | uuid.UUID | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    source_system: str = "factory",
    worker_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> bool:
    """Append one lifecycle event. Never raises — factory path must stay durable."""
    et = (event_type or "").strip().lower()
    if et not in VALID_EVENT_TYPES:
        logger.warning("production_line.unknown_event_type", event_type=event_type)
        return False
    jid = _as_uuid(job_id)
    wid = _as_uuid(workspace_id)
    mid = _as_uuid(mission_id)
    if not jid or not wid or not mid:
        return False

    try:
        import json

        factory = _get_session_factory()
        async with factory() as db:
            await db.execute(
                text(
                    """
                    INSERT INTO production_slot_events (
                        job_id, workspace_id, mission_id,
                        idea_index, slot_role, slot_key, format, pipeline,
                        event_type, status, attempt,
                        queue_wait_ms, duration_ms,
                        provider, model, artifact_id,
                        error_code, error_message,
                        source_system, worker_id, meta
                    ) VALUES (
                        CAST(:job_id AS UUID), CAST(:workspace_id AS UUID), CAST(:mission_id AS UUID),
                        :idea_index, :slot_role, :slot_key, :format, :pipeline,
                        :event_type, :status, :attempt,
                        :queue_wait_ms, :duration_ms,
                        :provider, :model, CAST(:artifact_id AS UUID),
                        :error_code, :error_message,
                        :source_system, :worker_id, CAST(:meta AS JSONB)
                    )
                    """
                ),
                {
                    "job_id": str(jid),
                    "workspace_id": str(wid),
                    "mission_id": str(mid),
                    "idea_index": idea_index,
                    "slot_role": (slot_role or None),
                    "slot_key": (slot_key or None)[:128] if slot_key else None,
                    "format": format,
                    "pipeline": pipeline,
                    "event_type": et,
                    "status": status or et,
                    "attempt": attempt,
                    "queue_wait_ms": _ms_int(queue_wait_ms),
                    "duration_ms": _ms_int(duration_ms),
                    "provider": (provider or None)[:64] if provider else None,
                    "model": (model or None)[:96] if model else None,
                    "artifact_id": str(artifact_id) if artifact_id else None,
                    "error_code": (error_code or None)[:96] if error_code else None,
                    "error_message": (error_message or None)[:1000] if error_message else None,
                    "source_system": (source_system or "factory")[:32],
                    "worker_id": worker_id,
                    "meta": json.dumps(meta or {}),
                },
            )
            await db.commit()
        return True
    except Exception as exc:
        logger.warning(
            "production_line.record_failed",
            job_id=str(job_id),
            event_type=et,
            error=str(exc)[:200],
        )
        return False


async def emit_from_job_row(
    job: dict[str, Any],
    event_type: str,
    *,
    status: str | None = None,
    queue_wait_ms: int | None = None,
    duration_ms: int | None = None,
    provider: str | None = None,
    model: str | None = None,
    artifact_id: str | uuid.UUID | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    source_system: str = "factory",
    worker_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> bool:
    """Convenience wrapper when a production_jobs row dict is already loaded."""
    return await record_slot_event(
        job_id=job.get("id"),
        workspace_id=job.get("workspace_id"),
        mission_id=job.get("mission_id"),
        event_type=event_type,
        status=status or job.get("status") or event_type,
        idea_index=job.get("idea_index"),
        slot_role=job.get("slot_role"),
        slot_key=job.get("slot_key") or job.get("library_slot_key"),
        format=job.get("format"),
        pipeline=job.get("pipeline"),
        attempt=job.get("attempts"),
        queue_wait_ms=queue_wait_ms if queue_wait_ms is not None else job.get("queue_wait_ms"),
        duration_ms=duration_ms if duration_ms is not None else job.get("duration_ms"),
        provider=provider,
        model=model,
        artifact_id=artifact_id if artifact_id is not None else job.get("artifact_id"),
        error_code=error_code,
        error_message=error_message if error_message is not None else job.get("last_error"),
        source_system=source_system,
        worker_id=worker_id or job.get("claimed_by"),
        meta=meta,
    )


def _percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    rank = (len(sorted_vals) - 1) * p
    lo = int(rank)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = rank - lo
    return float(sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac)


async def summarize_mission_production_line(mission_id: uuid.UUID) -> dict[str, Any]:
    """Mission rollup: job status + timing percentiles + cost join."""
    factory = _get_session_factory()
    async with factory() as db:
        jobs_res = await db.execute(
            text(
                """
                SELECT
                    status,
                    COUNT(*)::int AS n,
                    AVG(duration_ms)::float AS avg_duration_ms,
                    AVG(queue_wait_ms)::float AS avg_queue_wait_ms,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)
                        FILTER (WHERE duration_ms IS NOT NULL) AS p50_duration_ms,
                    percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms)
                        FILTER (WHERE duration_ms IS NOT NULL) AS p90_duration_ms
                FROM production_jobs
                WHERE mission_id = CAST(:mission_id AS UUID)
                GROUP BY status
                """
            ),
            {"mission_id": str(mission_id)},
        )
        by_status = {str(r.status): dict(r._mapping) for r in jobs_res.fetchall()}

        slots_res = await db.execute(
            text(
                """
                SELECT
                    id, idea_index, slot_role, slot_key, format, pipeline, status,
                    attempts, max_attempts, artifact_id, last_error,
                    queue_wait_ms, duration_ms, started_at, completed_at,
                    claimed_at, created_at, updated_at
                FROM production_jobs
                WHERE mission_id = CAST(:mission_id AS UUID)
                ORDER BY idea_index ASC, slot_role ASC
                """
            ),
            {"mission_id": str(mission_id)},
        )
        slots = []
        for r in slots_res.fetchall():
            d = dict(r._mapping)
            for k in ("id", "artifact_id"):
                if d.get(k) is not None:
                    d[k] = str(d[k])
            for k in ("started_at", "completed_at", "claimed_at", "created_at", "updated_at"):
                if d.get(k) is not None and hasattr(d[k], "isoformat"):
                    d[k] = d[k].isoformat()
            slots.append(d)

        events_res = await db.execute(
            text(
                """
                SELECT event_type, COUNT(*)::int AS n
                FROM production_slot_events
                WHERE mission_id = CAST(:mission_id AS UUID)
                GROUP BY event_type
                """
            ),
            {"mission_id": str(mission_id)},
        )
        event_counts = {str(r.event_type): int(r.n) for r in events_res.fetchall()}

        cost_res = await db.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(amount_usd), 0)::float AS total_usd,
                    COUNT(*)::int AS line_count
                FROM cost_events
                WHERE mission_id = CAST(:mission_id AS UUID)
                """
            ),
            {"mission_id": str(mission_id)},
        )
        cost_row = cost_res.first()

        recent_res = await db.execute(
            text(
                """
                SELECT
                    id, job_id, event_type, status, idea_index, slot_role, slot_key,
                    pipeline, attempt, queue_wait_ms, duration_ms, provider, model,
                    error_code, error_message, recorded_at
                FROM production_slot_events
                WHERE mission_id = CAST(:mission_id AS UUID)
                ORDER BY recorded_at DESC
                LIMIT 40
                """
            ),
            {"mission_id": str(mission_id)},
        )
        recent = []
        for r in recent_res.fetchall():
            d = dict(r._mapping)
            for k in ("id", "job_id"):
                if d.get(k) is not None:
                    d[k] = str(d[k])
            if d.get("recorded_at") is not None and hasattr(d["recorded_at"], "isoformat"):
                d["recorded_at"] = d["recorded_at"].isoformat()
            recent.append(d)

    total = sum(int(v.get("n") or 0) for v in by_status.values())
    ready = int(by_status.get("ready", {}).get("n") or 0)
    exhausted = int(by_status.get("exhausted", {}).get("n") or 0)
    failed = int(by_status.get("failed", {}).get("n") or 0)
    active = sum(
        int(by_status.get(s, {}).get("n") or 0)
        for s in ("pending", "claimed", "running", "failed")
    )
    durations = [
        float(s["duration_ms"])
        for s in slots
        if s.get("duration_ms") is not None
    ]
    durations.sort()
    waits = [
        float(s["queue_wait_ms"])
        for s in slots
        if s.get("queue_wait_ms") is not None
    ]
    waits.sort()

    return {
        "mission_id": str(mission_id),
        "totals": {
            "jobs": total,
            "ready": ready,
            "active": active,
            "failed": failed,
            "exhausted": exhausted,
            "success_rate": round(ready / total, 4) if total else None,
        },
        "by_status": {
            k: {
                "count": int(v.get("n") or 0),
                "avg_duration_ms": v.get("avg_duration_ms"),
                "avg_queue_wait_ms": v.get("avg_queue_wait_ms"),
                "p50_duration_ms": v.get("p50_duration_ms"),
                "p90_duration_ms": v.get("p90_duration_ms"),
            }
            for k, v in by_status.items()
        },
        "timing": {
            "avg_duration_ms": (sum(durations) / len(durations)) if durations else None,
            "p50_duration_ms": _percentile(durations, 0.5),
            "p90_duration_ms": _percentile(durations, 0.9),
            "avg_queue_wait_ms": (sum(waits) / len(waits)) if waits else None,
            "p50_queue_wait_ms": _percentile(waits, 0.5),
        },
        "cost": {
            "total_usd": float(cost_row.total_usd) if cost_row else 0.0,
            "line_count": int(cost_row.line_count) if cost_row else 0,
            "source": "cost_events",
        },
        "event_counts": event_counts,
        "slots": slots,
        "recent_events": recent,
    }


async def summarize_workspace_production_line(
    workspace_id: uuid.UUID,
    *,
    lookback_hours: int = 24,
) -> dict[str, Any]:
    """Workspace live board + recent timing/cost averages."""
    hours = max(1, min(int(lookback_hours), 168))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    factory = _get_session_factory()
    async with factory() as db:
        live_res = await db.execute(
            text(
                """
                SELECT
                    status,
                    COUNT(*)::int AS n
                FROM production_jobs
                WHERE workspace_id = CAST(:workspace_id AS UUID)
                  AND status IN ('pending', 'claimed', 'running', 'failed')
                GROUP BY status
                """
            ),
            {"workspace_id": str(workspace_id)},
        )
        live_by_status = {str(r.status): int(r.n) for r in live_res.fetchall()}

        active_res = await db.execute(
            text(
                """
                SELECT
                    id, mission_id, idea_index, slot_role, slot_key, format, pipeline,
                    status, attempts, last_error, queue_wait_ms, duration_ms,
                    claimed_at, started_at, created_at, updated_at, claimed_by
                FROM production_jobs
                WHERE workspace_id = CAST(:workspace_id AS UUID)
                  AND status IN ('claimed', 'running', 'pending', 'failed')
                ORDER BY
                    CASE status
                        WHEN 'running' THEN 0
                        WHEN 'claimed' THEN 1
                        WHEN 'failed' THEN 2
                        ELSE 3
                    END,
                    updated_at DESC
                LIMIT 60
                """
            ),
            {"workspace_id": str(workspace_id)},
        )
        live_jobs = []
        for r in active_res.fetchall():
            d = dict(r._mapping)
            for k in ("id", "mission_id"):
                if d.get(k) is not None:
                    d[k] = str(d[k])
            for k in ("claimed_at", "started_at", "created_at", "updated_at"):
                if d.get(k) is not None and hasattr(d[k], "isoformat"):
                    d[k] = d[k].isoformat()
            live_jobs.append(d)

        timing_res = await db.execute(
            text(
                """
                SELECT duration_ms, queue_wait_ms, status
                FROM production_jobs
                WHERE workspace_id = CAST(:workspace_id AS UUID)
                  AND updated_at >= :since
                  AND status IN ('ready', 'exhausted', 'failed', 'skipped')
                """
            ),
            {"workspace_id": str(workspace_id), "since": since},
        )
        duration_vals: list[float] = []
        wait_vals: list[float] = []
        terminal = {"ready": 0, "exhausted": 0, "failed": 0, "skipped": 0}
        for r in timing_res.fetchall():
            st = str(r.status)
            if st in terminal:
                terminal[st] += 1
            if r.duration_ms is not None:
                duration_vals.append(float(r.duration_ms))
            if r.queue_wait_ms is not None:
                wait_vals.append(float(r.queue_wait_ms))
        duration_vals.sort()
        wait_vals.sort()

        cost_res = await db.execute(
            text(
                """
                SELECT COALESCE(SUM(amount_usd), 0)::float AS total_usd,
                       COUNT(*)::int AS line_count
                FROM cost_events
                WHERE workspace_id = CAST(:workspace_id AS UUID)
                  AND recorded_at >= :since
                """
            ),
            {"workspace_id": str(workspace_id), "since": since},
        )
        cost_row = cost_res.first()

        events_res = await db.execute(
            text(
                """
                SELECT
                    id, job_id, mission_id, event_type, status, idea_index, slot_role,
                    slot_key, pipeline, attempt, queue_wait_ms, duration_ms,
                    provider, error_code, error_message, recorded_at
                FROM production_slot_events
                WHERE workspace_id = CAST(:workspace_id AS UUID)
                  AND recorded_at >= :since
                ORDER BY recorded_at DESC
                LIMIT 80
                """
            ),
            {"workspace_id": str(workspace_id), "since": since},
        )
        recent = []
        for r in events_res.fetchall():
            d = dict(r._mapping)
            for k in ("id", "job_id", "mission_id"):
                if d.get(k) is not None:
                    d[k] = str(d[k])
            if d.get("recorded_at") is not None and hasattr(d["recorded_at"], "isoformat"):
                d["recorded_at"] = d["recorded_at"].isoformat()
            recent.append(d)

    ready_n = terminal["ready"]
    done_n = sum(terminal.values())
    return {
        "workspace_id": str(workspace_id),
        "lookback_hours": hours,
        "live": {
            "by_status": live_by_status,
            "active_count": sum(live_by_status.values()),
            "jobs": live_jobs,
        },
        "period": {
            "terminal_by_status": terminal,
            "success_rate": round(ready_n / done_n, 4) if done_n else None,
            "avg_duration_ms": (sum(duration_vals) / len(duration_vals)) if duration_vals else None,
            "p50_duration_ms": _percentile(duration_vals, 0.5),
            "p90_duration_ms": _percentile(duration_vals, 0.9),
            "avg_queue_wait_ms": (sum(wait_vals) / len(wait_vals)) if wait_vals else None,
            "p50_queue_wait_ms": _percentile(wait_vals, 0.5),
            "cost_usd": float(cost_row.total_usd) if cost_row else 0.0,
            "cost_line_count": int(cost_row.line_count) if cost_row else 0,
        },
        "recent_events": recent,
    }


async def list_job_events(
    job_id: uuid.UUID,
    *,
    limit: int = 100,
) -> list[dict[str, Any]]:
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT *
                FROM production_slot_events
                WHERE job_id = CAST(:job_id AS UUID)
                ORDER BY recorded_at ASC
                LIMIT :limit
                """
            ),
            {"job_id": str(job_id), "limit": max(1, min(int(limit), 500))},
        )
        out = []
        for r in res.fetchall():
            d = dict(r._mapping)
            for k, v in list(d.items()):
                if isinstance(v, uuid.UUID):
                    d[k] = str(v)
                elif isinstance(v, Decimal):
                    d[k] = float(v)
                elif isinstance(v, datetime):
                    d[k] = v.isoformat()
            out.append(d)
        return out
