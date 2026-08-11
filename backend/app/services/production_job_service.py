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

# SQL fragment — permanent gallery-theme failures must not re-enter the retry loop.
_PERMANENT_FAILURE_REQUEUE_FILTER = """
  AND COALESCE(last_error, '') NOT ILIKE '%tema çatışması%'
  AND COALESCE(last_error, '') NOT ILIKE '%gallery_theme_mismatch%'
"""
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
    inserted_rows: list[dict[str, Any]] = []
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
            # Faz 5 — tenant catalog slot binding (production_slot_definitions.slot_key)
            catalog_slot_key = (
                slot.get("catalog_slot_key") or slot.get("catalogSlotKey") or None
            )
            payload = slot.get("payload")
            catalog_label = slot.get("catalog_slot_label") or slot.get("catalogSlotLabel")
            if catalog_label:
                payload = {**(payload or {}), "catalogSlotLabel": str(catalog_label)}
            res = await db.execute(
                text(
                    """
                    INSERT INTO production_jobs (
                        workspace_id, mission_id, node_key, idea_index, slot_role,
                        format, pipeline, library_slot_key, slot_key, status,
                        max_attempts, payload
                    ) VALUES (
                        :workspace_id, :mission_id, :node_key, :idea_index, :slot_role,
                        :format, :pipeline, :library_slot_key, :slot_key, 'pending',
                        :max_attempts, CAST(:payload AS JSONB)
                    )
                    ON CONFLICT (mission_id, idea_index, slot_role) DO NOTHING
                    RETURNING id, workspace_id, mission_id, idea_index, slot_role,
                              slot_key, format, pipeline, status, attempts
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
                    "slot_key": str(catalog_slot_key) if catalog_slot_key else None,
                    "max_attempts": int(max_attempts),
                    "payload": json.dumps(payload) if payload is not None else None,
                },
            )
            row = res.first()
            if row is not None:
                inserted += 1
                inserted_rows.append(_row_to_dict(row))
        await db.commit()

    if inserted_rows:
        from app.services.production_line_telemetry_service import emit_from_job_row

        for row in inserted_rows:
            await emit_from_job_row(row, "queued", status="pending")

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
                    started_at = NULL,
                    queue_wait_ms = GREATEST(
                        0,
                        (EXTRACT(EPOCH FROM (now() - j.created_at)) * 1000)::int
                    ),
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
        from app.services.production_line_telemetry_service import emit_from_job_row

        for row in rows:
            await emit_from_job_row(
                row,
                "claimed",
                status="claimed",
                worker_id=_WORKER_ID,
            )
        logger.info(
            "production_jobs.claim",
            mission_id=str(mission_id) if mission_id else None,
            claimed=len(rows),
            ids=[r["id"] for r in rows],
        )
    return rows


async def mark_running(job_id: str | uuid.UUID) -> None:
    factory = _get_session_factory()
    row_dict: dict[str, Any] | None = None
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'running',
                    started_at = now(),
                    updated_at = now()
                WHERE id = CAST(:id AS UUID)
                RETURNING *
                """
            ),
            {"id": str(job_id)},
        )
        row = res.first()
        if row is not None:
            row_dict = _row_to_dict(row)
        await db.commit()
    if row_dict:
        from app.services.production_line_telemetry_service import emit_from_job_row

        await emit_from_job_row(row_dict, "running", status="running")


async def mark_ready(
    job_id: str | uuid.UUID,
    *,
    artifact_id: str | uuid.UUID | None = None,
) -> None:
    factory = _get_session_factory()
    row_dict: dict[str, Any] | None = None
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'ready',
                    artifact_id = CASE WHEN CAST(:artifact_id AS UUID) IS NULL THEN artifact_id
                                       ELSE CAST(:artifact_id AS UUID) END,
                    attempts = attempts + 1,
                    last_error = NULL,
                    completed_at = now(),
                    duration_ms = CASE
                        WHEN started_at IS NOT NULL THEN
                            GREATEST(0, (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int)
                        WHEN claimed_at IS NOT NULL THEN
                            GREATEST(0, (EXTRACT(EPOCH FROM (now() - claimed_at)) * 1000)::int)
                        ELSE duration_ms
                    END,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    updated_at = now()
                WHERE id = CAST(:id AS UUID)
                RETURNING *
                """
            ),
            {"id": str(job_id), "artifact_id": str(artifact_id) if artifact_id else None},
        )
        row = res.first()
        if row is not None:
            row_dict = _row_to_dict(row)
        await db.commit()
    if row_dict:
        from app.services.production_line_telemetry_service import emit_from_job_row

        await emit_from_job_row(row_dict, "ready", status="ready")


async def mark_deferred(
    job_id: str | uuid.UUID,
    reason: str,
    *,
    delay_sec: float = 45.0,
) -> None:
    """Re-queue without burning an attempt — e.g. auto-produce 409 production lock."""
    factory = _get_session_factory()
    row_dict: dict[str, Any] | None = None
    async with factory() as db:
        res = await db.execute(
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
                RETURNING *
                """
            ),
            {
                "id": str(job_id),
                "error": (reason or "")[:1000],
                "delay_sec": max(5.0, float(delay_sec)),
            },
        )
        row = res.first()
        if row is not None:
            row_dict = _row_to_dict(row)
        await db.commit()
    if row_dict:
        from app.services.production_line_telemetry_service import emit_from_job_row

        await emit_from_job_row(
            row_dict,
            "deferred",
            status="pending",
            error_code="deferred",
            error_message=reason,
            meta={"delay_sec": max(5.0, float(delay_sec))},
        )


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
    row_dict: dict[str, Any] | None = None
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET attempts = attempts + 1,
                    last_error = :error,
                    completed_at = now(),
                    duration_ms = CASE
                        WHEN started_at IS NOT NULL THEN
                            GREATEST(0, (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int)
                        WHEN claimed_at IS NOT NULL THEN
                            GREATEST(0, (EXTRACT(EPOCH FROM (now() - claimed_at)) * 1000)::int)
                        ELSE duration_ms
                    END,
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
                RETURNING *
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
        if row is not None:
            row_dict = _row_to_dict(row)
        await db.commit()
    status = str(row_dict["status"]) if row_dict else "failed"
    if row_dict:
        from app.services.production_line_telemetry_service import emit_from_job_row

        event = "exhausted" if status == "exhausted" else "failed"
        await emit_from_job_row(
            row_dict,
            event,
            status=status,
            error_message=error,
            meta={"retryable": bool(retryable)},
        )
    return status


async def mark_skipped(job_id: str | uuid.UUID, reason: str = "") -> None:
    factory = _get_session_factory()
    row_dict: dict[str, Any] | None = None
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs
                SET status = 'skipped', last_error = :reason,
                    completed_at = now(),
                    claimed_at = NULL, claimed_by = NULL, updated_at = now()
                WHERE id = CAST(:id AS UUID)
                RETURNING *
                """
            ),
            {"id": str(job_id), "reason": (reason or "")[:500]},
        )
        row = res.first()
        if row is not None:
            row_dict = _row_to_dict(row)
        await db.commit()
    if row_dict:
        from app.services.production_line_telemetry_service import emit_from_job_row

        await emit_from_job_row(
            row_dict,
            "skipped",
            status="skipped",
            error_message=reason,
        )


async def mission_job_summary(mission_id: uuid.UUID, *, enrich: bool = True) -> dict[str, Any]:
    """Per-mission rollup: total/ready/active/failed counts + per-slot rows."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT id, idea_index, slot_role, format, pipeline, status,
                       attempts, max_attempts, artifact_id, last_error, updated_at,
                       slot_key, payload
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
    skipped = sum(1 for r in rows if r["status"] == "skipped")
    exhausted = sum(1 for r in rows if r["status"] == "exhausted")
    failed = sum(1 for r in rows if r["status"] == "failed") + exhausted
    in_flight = sum(1 for r in rows if r["status"] in ("claimed", "running"))
    queued = sum(1 for r in rows if r["status"] in ("pending", "failed"))
    active = in_flight + queued
    terminal_unfilled = exhausted + skipped
    summary = {
        "mission_id": str(mission_id),
        "total": total,
        "ready": ready,
        "failed": failed,
        "skipped": skipped,
        "active": active,
        "inFlight": in_flight,
        "queued": queued,
        # Package is done when every slot reached a terminal outcome (ready or permanent skip).
        "complete": total > 0 and active == 0 and (ready >= total or ready + terminal_unfilled >= total),
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
                # Faz 5 — tenant catalog binding for Mission Hub slot cards
                "catalogSlotKey": r.get("slot_key"),
                "catalogSlotLabel": (
                    (r.get("payload") or {}).get("catalogSlotLabel")
                    if isinstance(r.get("payload"), dict)
                    else None
                ),
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
    include_gallery_theme_retry: bool = False,
    include_billing_retry: bool = False,
) -> int:
    """Guaranteed-fill: give exhausted slots more retries (bounded) so the drainer
    can fill them (e.g. after the reel Remotion fallback is in place). Returns count
    of rows requeued. The attempts ceiling prevents infinite retry loops."""
    # Permanent failures: do not auto-requeue (needs new gallery or templates).
    # Billing/quota: skipped unless include_billing_retry (operator kick / circuit clear).
    permanent_filter = """
                  AND COALESCE(last_error, '') NOT ILIKE '%library_template_required%'
    """
    if not include_billing_retry:
        permanent_filter += """
                  AND COALESCE(last_error, '') NOT ILIKE '%skip-no-fal-quota%'
                  AND COALESCE(last_error, '') NOT ILIKE '%provider_billing_circuit_open%'
                  AND COALESCE(last_error, '') NOT ILIKE '%balance exhausted%'
                  AND COALESCE(last_error, '') NOT ILIKE '%exhausted balance%'
                  AND COALESCE(last_error, '') NOT ILIKE '%insufficient_quota%'
        """
    if not include_gallery_theme_retry:
        permanent_filter += """
                  AND COALESCE(last_error, '') NOT ILIKE '%tema çatışması%'
                  AND COALESCE(last_error, '') NOT ILIKE '%gallery_theme_mismatch%'
        """
    attempts_filter = ""
    if not include_gallery_theme_retry and not include_billing_retry:
        attempts_filter = "AND attempts < :ceiling"
    requeue_suffix = (
        " [gallery-retry]" if include_gallery_theme_retry
        else (" [billing-retry]" if include_billing_retry else " [requeued]")
    )
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                UPDATE production_jobs
                SET status = 'pending',
                    attempts = CASE
                        WHEN :gallery_retry OR :billing_retry THEN 0
                        ELSE attempts
                    END,
                    max_attempts = CASE
                        WHEN :gallery_retry OR :billing_retry THEN GREATEST(max_attempts, :ceiling)
                        ELSE GREATEST(max_attempts, LEAST(:ceiling, attempts + 1))
                    END,
                    run_after = now(),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    last_error = CASE
                        WHEN :billing_retry THEN ''
                        ELSE COALESCE(last_error, '') || :requeue_suffix
                    END,
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status = 'exhausted'
                  {attempts_filter}
                  {permanent_filter}
                RETURNING id
                """
            ),
            {
                "mission_id": str(mission_id),
                "ceiling": int(attempts_ceiling),
                "gallery_retry": bool(include_gallery_theme_retry),
                "billing_retry": bool(include_billing_retry),
                "requeue_suffix": requeue_suffix,
            },
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.requeue_exhausted",
            mission_id=str(mission_id),
            requeued=len(rows),
            gallery_theme_retry=include_gallery_theme_retry,
            billing_retry=include_billing_retry,
        )
    if include_gallery_theme_retry and rows:
        await _clear_gallery_urls_from_job_payloads(mission_id, [str(r[0]) for r in rows])
        await _escalate_gallery_failed_jobs_to_fal_only(mission_id, [str(r[0]) for r in rows])
    return len(rows)


async def requeue_billing_exhausted_recent(
    *,
    workspace_id: uuid.UUID | None = None,
    lookback_hours: int = 72,
    limit: int = 200,
) -> list[tuple[str, str]]:
    """After provider billing circuits are cleared — revive billing-exhausted factory jobs.

    Multi-tenant safe: optional workspace scope; never brand-name branches.
    Returns list of (mission_id, workspace_id) pairs that need a drain kick.
    """
    factory = _get_session_factory()
    ws_clause = (
        "AND workspace_id = CAST(:workspace_id AS UUID)"
        if workspace_id is not None
        else ""
    )
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                UPDATE production_jobs
                SET status = 'pending',
                    attempts = 0,
                    max_attempts = GREATEST(max_attempts, 3),
                    run_after = now(),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    last_error = '',
                    updated_at = now()
                WHERE id IN (
                  SELECT id FROM production_jobs
                  WHERE status IN ('exhausted', 'failed')
                    AND updated_at > now() - make_interval(hours => :hours)
                    AND (
                      last_error ILIKE '%provider_billing%'
                      OR last_error ILIKE '%skip-no-fal-quota%'
                      OR last_error ILIKE '%balance exhausted%'
                      OR last_error ILIKE '%exhausted balance%'
                      OR last_error ILIKE '%insufficient_quota%'
                    )
                    {ws_clause}
                  ORDER BY updated_at DESC
                  LIMIT :lim
                )
                RETURNING mission_id::text, workspace_id::text
                """
            ),
            {
                "hours": int(lookback_hours),
                "lim": int(limit),
                **({"workspace_id": str(workspace_id)} if workspace_id is not None else {}),
            },
        )
        rows = res.fetchall()
        await db.commit()
    pairs = list({(str(r[0]), str(r[1])) for r in rows})
    if pairs:
        logger.info(
            "production_jobs.requeue_billing_exhausted_recent",
            requeued=len(rows),
            missions=len(pairs),
            workspace_id=str(workspace_id) if workspace_id else None,
        )
    return pairs


async def _escalate_gallery_failed_jobs_to_fal_only(
    mission_id: uuid.UUID,
    job_ids: list[str],
) -> None:
    """Reroute gallery-veto exhausted slots to fal_only so the next drain skips gallery gates."""
    if not job_ids:
        return
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET pipeline = CASE
                    WHEN format = 'story' THEN 'fal_only_story'
                    WHEN format = 'reel' THEN 'fal_only_reel'
                    WHEN format IN ('post', 'feed') THEN 'fal_only_post'
                    ELSE pipeline
                END,
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND id = ANY(CAST(:ids AS UUID[]))
                  AND COALESCE(last_error, '') ILIKE '%tema çatışması%'
                """
            ),
            {"mission_id": str(mission_id), "ids": job_ids},
        )
        await db.commit()


async def _clear_gallery_urls_from_job_payloads(
    mission_id: uuid.UUID,
    job_ids: list[str],
) -> None:
    """Drop stale factory gallery picks so the next drain re-runs batch assignment."""
    if not job_ids:
        return
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET payload = COALESCE(payload, '{}'::jsonb)
                    - 'galleryPhotoUrl' - 'gallery_photo_url' - 'galleryMatchScore',
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND id = ANY(CAST(:ids AS UUID[]))
                """
            ),
            {"mission_id": str(mission_id), "ids": job_ids},
        )
        await db.commit()


async def requeue_failed(
    mission_id: uuid.UUID,
    *,
    include_billing_retry: bool = False,
) -> int:
    """Retry failed slots that still have attempts remaining (gallery gate / transient errors)."""
    billing_filter = ""
    if not include_billing_retry:
        billing_filter = """
                  AND COALESCE(last_error, '') NOT ILIKE '%skip-no-fal-quota%'
                  AND COALESCE(last_error, '') NOT ILIKE '%provider_billing_circuit_open%'
                  AND COALESCE(last_error, '') NOT ILIKE '%balance exhausted%'
                  AND COALESCE(last_error, '') NOT ILIKE '%exhausted balance%'
        """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                UPDATE production_jobs
                SET status = 'pending',
                    attempts = CASE WHEN :billing_retry THEN 0 ELSE attempts END,
                    run_after = now(),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    last_error = CASE WHEN :billing_retry THEN '' ELSE last_error END,
                    updated_at = now()
                WHERE mission_id = CAST(:mission_id AS UUID)
                  AND status = 'failed'
                  AND (attempts < max_attempts OR :billing_retry)
                  AND COALESCE(last_error, '') NOT ILIKE '%tema çatışması%'
                  AND COALESCE(last_error, '') NOT ILIKE '%gallery_theme_mismatch%'
                  AND COALESCE(last_error, '') NOT ILIKE '%library_template_required%'
                  {billing_filter}
                RETURNING id
                """
            ),
            {
                "mission_id": str(mission_id),
                "billing_retry": bool(include_billing_retry),
            },
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.requeue_failed",
            mission_id=str(mission_id),
            requeued=len(rows),
            billing_retry=include_billing_retry,
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
