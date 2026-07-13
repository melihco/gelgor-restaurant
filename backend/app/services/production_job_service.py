"""Durable Production Factory — Postgres-backed per-slot job queue.

Each mission weekly package targets 16 slots (5 story · 6 post · 1 carousel · 4 reel).
Every slot is a row in ``production_jobs``. A drainer claims jobs with
``FOR UPDATE SKIP LOCKED`` (durable, replica-safe), produces each via the existing
Next ``runProduction`` backfill path, and retries failures with exponential backoff
until the manifest is satisfied.

Node never touches Postgres directly (architecture invariant): Python owns the queue,
Next is only the executor.
"""

from __future__ import annotations

import json
import socket
import uuid
from typing import Any

import structlog
from sqlalchemy import text

logger = structlog.get_logger()

# Terminal states — a job in one of these is never re-claimed by the drainer.
TERMINAL_STATUSES = {"ready", "exhausted", "skipped"}
ACTIVE_STATUSES = {"pending", "failed", "claimed", "running"}

# Backoff: run_after = now() + min(2^attempts * BASE, CAP)
_BACKOFF_BASE_SEC = 30
_BACKOFF_CAP_SEC = 900  # 15 min
# Stale claim reclaim: a claimed/running job whose worker died becomes claimable again.
_STALE_CLAIM_SEC = 1800  # 30 min — Remotion renders routinely take 5-15 min
# Proactive reclaim at each factory drain pass (shorter than _STALE_CLAIM_SEC).
_FACTORY_DRAIN_STALE_RECLAIM_SEC = 600  # 10 min
# BullMQ drain: reclaim running rows when enqueue/worker never completes (dev-friendly).
_BULLMQ_DRAIN_STALE_RECLAIM_SEC = 180  # 3 min — Next compile / enqueue timeout recovery
# BullMQ watchdog: reclaim running rows when worker callback never arrives (~max auto-produce).
_BULLMQ_WATCHDOG_STALE_SEC = 660  # 11 min — above Next maxDuration 600s

_WORKER_ID = f"{socket.gethostname()}:{uuid.uuid4().hex[:8]}"


def _get_session_factory():
    from app.services.production_bridge import get_session_factory

    return get_session_factory()


def _row_to_dict(row: Any) -> dict[str, Any]:
    d = dict(row._mapping)
    # Normalise UUID/json types for downstream JSON use.
    for k in ("id", "workspace_id", "mission_id", "artifact_id"):
        if d.get(k) is not None:
            d[k] = str(d[k])
    payload = d.get("payload")
    if isinstance(payload, str):
        try:
            d["payload"] = json.loads(payload)
        except Exception:
            d["payload"] = None
    return d


async def upsert_jobs(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str | None,
    slots: list[dict[str, Any]],
    *,
    max_attempts: int = 3,
) -> int:
    """Idempotently insert one job per slot descriptor.

    Existing rows (same mission_id, idea_index, slot_role) are preserved — re-enqueue
    never resets a slot that is already ready/in-flight. Returns rows inserted.
    """
    if not slots:
        return 0

    factory = _get_session_factory()
    inserted = 0
    async with factory() as db:
        for slot in slots:
            idea_index = int(slot.get("idea_index", slot.get("ideaIndex", 0)) or 0)
            slot_role = str(slot.get("slot_role") or slot.get("slotRole") or "").strip()
            fmt = str(slot.get("format") or "post").strip()
            pipeline = str(slot.get("pipeline") or fmt).strip()
            if not slot_role:
                continue
            library_slot_key = (
                slot.get("library_slot_key") or slot.get("librarySlotKey") or None
            )
            payload = slot.get("payload")
            res = await db.execute(
                text(
                    """
                    INSERT INTO production_jobs (
                        workspace_id, mission_id, node_key, idea_index, slot_role,
                        format, pipeline, library_slot_key, status, max_attempts, payload
                    ) VALUES (
                        :workspace_id, :mission_id, :node_key, :idea_index, :slot_role,
                        :format, :pipeline, :library_slot_key, 'pending', :max_attempts,
                        CAST(:payload AS JSONB)
                    )
                    ON CONFLICT (mission_id, idea_index, slot_role) DO NOTHING
                    RETURNING id
                    """
                ),
                {
                    "workspace_id": str(workspace_id),
                    "mission_id": str(mission_id),
                    "node_key": node_key,
                    "idea_index": idea_index,
                    "slot_role": slot_role,
                    "format": fmt,
                    "pipeline": pipeline,
                    "library_slot_key": library_slot_key,
                    "max_attempts": int(max_attempts),
                    "payload": json.dumps(payload) if payload is not None else None,
                },
            )
            if res.first() is not None:
                inserted += 1
        await db.commit()

    logger.info(
        "production_jobs.upsert",
        mission_id=str(mission_id),
        slots=len(slots),
        inserted=inserted,
    )
    return inserted


async def claim_batch(
    mission_id: uuid.UUID | None,
    *,
    limit: int = 2,
    stale_sec: int = _STALE_CLAIM_SEC,
) -> list[dict[str, Any]]:
    """Atomically claim up to ``limit`` runnable jobs (FOR UPDATE SKIP LOCKED).

    A job is runnable when it is pending/failed and ``run_after <= now()``, OR it was
    claimed/running but its worker went stale. Marks claimed rows and returns them.
    """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                WITH claimable AS (
                    SELECT id FROM production_jobs
                    WHERE (CAST(:mission_id AS UUID) IS NULL
                           OR mission_id = CAST(:mission_id AS UUID))
                      AND (
                        (status IN ('pending', 'failed') AND run_after <= now())
                        OR (status IN ('claimed', 'running')
                            AND claimed_at < now() - make_interval(secs => :stale_sec))
                      )
                    ORDER BY COALESCE(priority, 0) DESC, run_after ASC
                    LIMIT :limit
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE production_jobs j
                SET status = 'claimed',
                    claimed_at = now(),
                    claimed_by = :worker,
                    updated_at = now()
                FROM claimable c
                WHERE j.id = c.id
                RETURNING j.*
                """
            ),
            {
                "mission_id": str(mission_id) if mission_id else None,
                "limit": int(limit),
                "stale_sec": int(stale_sec),
                "worker": _WORKER_ID,
            },
        )
        rows = [_row_to_dict(r) for r in res.fetchall()]
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.claim",
            mission_id=str(mission_id) if mission_id else None,
            claimed=len(rows),
            ids=[r["id"] for r in rows],
        )
    return rows


async def mark_running(job_id: str | uuid.UUID) -> None:
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'running', updated_at = now()
                WHERE id = CAST(:id AS UUID)
                """
            ),
            {"id": str(job_id)},
        )
        await db.commit()


async def mark_ready(
    job_id: str | uuid.UUID,
    *,
    artifact_id: str | uuid.UUID | None = None,
) -> None:
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'ready',
                    artifact_id = CASE WHEN CAST(:artifact_id AS UUID) IS NULL THEN artifact_id
                                       ELSE CAST(:artifact_id AS UUID) END,
                    attempts = attempts + 1,
                    last_error = NULL,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    updated_at = now()
                WHERE id = CAST(:id AS UUID)
                """
            ),
            {"id": str(job_id), "artifact_id": str(artifact_id) if artifact_id else None},
        )
        await db.commit()


async def mark_deferred(
    job_id: str | uuid.UUID,
    reason: str,
    *,
    delay_sec: float = 45.0,
) -> None:
    """Re-queue without burning an attempt — e.g. auto-produce 409 production lock."""
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'pending',
                    last_error = :error,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    run_after = now() + make_interval(secs => :delay_sec),
                    updated_at = now()
                WHERE id = CAST(:id AS UUID)
                """
            ),
            {
                "id": str(job_id),
                "error": (reason or "")[:1000],
                "delay_sec": max(5.0, float(delay_sec)),
            },
        )
        await db.commit()


async def mark_failed(
    job_id: str | uuid.UUID,
    error: str,
    *,
    retryable: bool = True,
) -> str:
    """Increment attempts and schedule a backoff retry, or mark exhausted.

    Returns the resulting status ('failed' or 'exhausted').
    """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET attempts = attempts + 1,
                    last_error = :error,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    status = CASE
                        WHEN NOT :retryable THEN 'exhausted'
                        WHEN attempts + 1 >= max_attempts THEN 'exhausted'
                        ELSE 'failed' END,
                    run_after = now() + make_interval(
                        secs => LEAST(:cap, :base * power(2, attempts))
                    ),
                    updated_at = now()
                WHERE id = CAST(:id AS UUID)
                RETURNING status
                """
            ),
            {
                "id": str(job_id),
                "error": (error or "")[:1000],
                "retryable": bool(retryable),
                "base": _BACKOFF_BASE_SEC,
                "cap": _BACKOFF_CAP_SEC,
            },
        )
        row = res.first()
        await db.commit()
    return str(row[0]) if row else "failed"


async def mark_skipped(job_id: str | uuid.UUID, reason: str = "") -> None:
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'skipped', last_error = :reason,
                    claimed_at = NULL, claimed_by = NULL, updated_at = now()
                WHERE id = CAST(:id AS UUID)
                """
            ),
            {"id": str(job_id), "reason": (reason or "")[:500]},
        )
        await db.commit()


async def mission_job_summary(mission_id: uuid.UUID, *, enrich: bool = True) -> dict[str, Any]:
    """Per-mission rollup: total/ready/active/failed counts + per-slot rows."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT id, idea_index, slot_role, format, pipeline, status,
                       attempts, max_attempts, artifact_id, last_error, updated_at
                FROM production_jobs
                WHERE mission_id = CAST(:mission_id AS UUID)
                ORDER BY idea_index ASC, slot_role ASC
                """
            ),
            {"mission_id": str(mission_id)},
        )
        rows = [_row_to_dict(r) for r in res.fetchall()]

    total = len(rows)
    ready = sum(1 for r in rows if r["status"] == "ready")
    failed = sum(1 for r in rows if r["status"] in ("failed", "exhausted"))
    in_flight = sum(1 for r in rows if r["status"] in ("claimed", "running"))
    queued = sum(1 for r in rows if r["status"] in ("pending", "failed"))
    active = in_flight + queued
    summary = {
        "mission_id": str(mission_id),
        "total": total,
        "ready": ready,
        "failed": failed,
        "active": active,
        "inFlight": in_flight,
        "queued": queued,
        "complete": total > 0 and ready >= total,
        "slots": [
            {
                "ideaIndex": r["idea_index"],
                "slotRole": r["slot_role"],
                "format": r["format"],
                "pipeline": r["pipeline"],
                "status": r["status"],
                "attempts": r["attempts"],
                "maxAttempts": r["max_attempts"],
                "artifactId": r.get("artifact_id"),
                "lastError": r.get("last_error"),
                "updatedAt": str(r["updated_at"]) if r.get("updated_at") else None,
            }
            for r in rows
        ],
    }
    if enrich:
        from app.services.production_status import enrich_mission_job_summary

        return await enrich_mission_job_summary(summary)
    return summary


async def boost_mission_job_priority(
    mission_id: uuid.UUID,
    *,
    priority: int = 5,
) -> int:
    """Raise priority on open slots so operator kicks jump the fair-share queue."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET priority = GREATEST(COALESCE(priority, 0), :priority),
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status IN ('pending', 'failed')
                RETURNING id
                """
            ),
            {"mission_id": str(mission_id), "priority": int(priority)},
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.priority_boost",
            mission_id=str(mission_id),
            priority=priority,
            slots=len(rows),
        )
    return len(rows)


async def reclaim_stale_jobs(
    mission_id: uuid.UUID,
    *,
    stale_sec: int = _STALE_CLAIM_SEC,
) -> int:
    """Reset stale claimed/running rows to pending so an operator kick can resume immediately.

    Without this, a crashed drainer leaves slots in ``running`` until the stale window
    passes and ``claim_batch`` reclaims them — but ``kick-feed-production`` may coalesce
    into a no-op if no new ensure/drain task is scheduled.
    """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'pending',
                    claimed_at = NULL,
                    claimed_by = NULL,
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status IN ('claimed', 'running')
                  AND claimed_at < now() - make_interval(secs => :stale_sec)
                RETURNING id
                """
            ),
            {"mission_id": str(mission_id), "stale_sec": int(stale_sec)},
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.reclaim_stale",
            mission_id=str(mission_id),
            reclaimed=len(rows),
        )
    return len(rows)


async def reclaim_inflight_jobs(mission_id: uuid.UUID) -> int:
    """Reset all claimed/running rows to pending (operator kick / missing BullMQ worker).

    BullMQ mode marks jobs ``running`` at enqueue time; without a worker process they
    stay in-flight indefinitely. Operator kick should always recycle these slots.
    """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'pending',
                    claimed_at = NULL,
                    claimed_by = NULL,
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status IN ('claimed', 'running')
                RETURNING id
                """
            ),
            {"mission_id": str(mission_id)},
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.reclaim_inflight",
            mission_id=str(mission_id),
            reclaimed=len(rows),
        )
    return len(rows)


async def has_open_jobs(mission_id: uuid.UUID) -> bool:
    """True if any non-terminal job rows exist for the mission (drainer should run)."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT 1 FROM production_jobs
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status IN ('pending', 'failed', 'claimed', 'running')
                LIMIT 1
                """
            ),
            {"mission_id": str(mission_id)},
        )
        return res.first() is not None


async def list_missions_with_exhausted_incomplete(limit: int = 25) -> list[tuple[str, str]]:
    """(mission_id, workspace_id) for missions that have exhausted slots and are NOT
    yet complete (some slot never reached 'ready'). These need guaranteed-fill."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT mission_id, workspace_id
                FROM production_jobs
                GROUP BY mission_id, workspace_id
                HAVING bool_or(status = 'exhausted')
                   AND count(*) FILTER (WHERE status = 'ready') < count(*)
                LIMIT :limit
                """
            ),
            {"limit": int(limit)},
        )
        return [(str(r[0]), str(r[1])) for r in res.fetchall()]


async def requeue_exhausted(
    mission_id: uuid.UUID,
    *,
    attempts_ceiling: int = 12,
) -> int:
    """Guaranteed-fill: give exhausted slots more retries (bounded) so the drainer
    can fill them (e.g. after the reel Remotion fallback is in place). Returns count
    of rows requeued. The attempts ceiling prevents infinite retry loops."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'pending',
                    max_attempts = GREATEST(max_attempts, LEAST(:ceiling, attempts + 1)),
                    run_after = now(),
                    last_error = COALESCE(last_error, '') || ' [requeued]',
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status = 'exhausted'
                  AND attempts < :ceiling
                RETURNING id
                """
            ),
            {"mission_id": str(mission_id), "ceiling": int(attempts_ceiling)},
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.requeue_exhausted",
            mission_id=str(mission_id),
            requeued=len(rows),
        )
    return len(rows)


async def requeue_failed(
    mission_id: uuid.UUID,
) -> int:
    """Retry failed slots that still have attempts remaining (gallery gate / transient errors)."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'pending',
                    run_after = now(),
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status = 'failed'
                  AND attempts < max_attempts
                RETURNING id
                """
            ),
            {"mission_id": str(mission_id)},
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.requeue_failed",
            mission_id=str(mission_id),
            requeued=len(rows),
        )
    return len(rows)


async def list_missions_with_open_jobs(limit: int = 50) -> list[str]:
    """Distinct mission ids that still have runnable (or stale-claimed) jobs."""
    from app.config import get_settings

    settings = get_settings()
    if settings.production_fair_share_enabled:
        return await list_missions_with_open_jobs_fair_share(limit=limit)

    stale_sec = (
        _BULLMQ_WATCHDOG_STALE_SEC
        if settings.use_bullmq_executor
        else _STALE_CLAIM_SEC
    )
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT DISTINCT mission_id FROM production_jobs
                WHERE (status IN ('pending', 'failed') AND run_after <= now())
                   OR (status IN ('claimed', 'running')
                       AND claimed_at < now() - make_interval(secs => :stale_sec))
                LIMIT :limit
                """
            ),
            {"stale_sec": stale_sec, "limit": int(limit)},
        )
        return [str(r[0]) for r in res.fetchall()]


async def list_missions_with_open_jobs_fair_share(limit: int = 50) -> list[str]:
    """One runnable mission per workspace, ordered by oldest waiting slot (fair-share)."""
    from app.config import get_settings

    settings = get_settings()
    stale_sec = (
        _BULLMQ_WATCHDOG_STALE_SEC
        if settings.use_bullmq_executor
        else _STALE_CLAIM_SEC
    )
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                WITH runnable AS (
                    SELECT mission_id, workspace_id,
                           MIN(COALESCE(run_after, updated_at)) AS oldest_wait,
                           MAX(COALESCE(priority, 0)) AS max_priority
                    FROM production_jobs
                    WHERE (
                        status IN ('pending', 'failed') AND run_after <= now()
                    ) OR (
                        status IN ('claimed', 'running')
                        AND claimed_at < now() - make_interval(secs => :stale_sec)
                    )
                    GROUP BY mission_id, workspace_id
                ),
                ranked AS (
                    SELECT mission_id, workspace_id, oldest_wait, max_priority,
                           ROW_NUMBER() OVER (
                               PARTITION BY workspace_id
                               ORDER BY max_priority DESC, oldest_wait ASC
                           ) AS ws_rank
                    FROM runnable
                )
                SELECT mission_id::text
                FROM ranked
                WHERE ws_rank = 1
                ORDER BY max_priority DESC, oldest_wait ASC
                LIMIT :limit
                """
            ),
            {"stale_sec": stale_sec, "limit": int(limit)},
        )
        return [str(r[0]) for r in res.fetchall()]


async def list_mission_ids_with_any_open_jobs(limit: int = 50) -> list[str]:
    """Mission ids with any non-terminal job (for watchdog reclaim sweep)."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT DISTINCT mission_id FROM production_jobs
                WHERE status IN ('pending', 'failed', 'claimed', 'running')
                LIMIT :limit
                """
            ),
            {"limit": int(limit)},
        )
        return [str(r[0]) for r in res.fetchall()]


async def detect_split_brain_mismatches(mission_id: uuid.UUID) -> list[dict[str, Any]]:
    """Detect jobs marked 'ready' in Postgres that may not have corresponding Nexus artifacts.

    Returns jobs whose updated_at is > 10 min old but have no artifact_id set.
    These indicate a split-brain state where the job completed but the artifact
    was never persisted to Nexus.
    """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT id, slot_role, idea_index, status, artifact_id, updated_at
                FROM production_jobs
                WHERE mission_id = :mid
                  AND status = 'ready'
                  AND artifact_id IS NULL
                  AND updated_at < now() - interval '10 minutes'
                ORDER BY updated_at ASC
                """
            ),
            {"mid": str(mission_id)},
        )
        rows = res.mappings().fetchall()
        return [
            {
                "job_id": str(r["id"]),
                "slot_role": r["slot_role"],
                "idea_index": r["idea_index"],
                "status": r["status"],
                "updated_at": str(r["updated_at"]),
                "issue": "ready_without_artifact",
            }
            for r in rows
        ]
