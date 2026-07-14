"""Durable Production Factory — orchestrator.

Turns a mission's weekly package (5 story · 6 post · 1 carousel · 4 reel) into durable
per-slot jobs and drains them in small batches. Each drained batch is produced via the
existing Next ``runProduction`` backfill path, so the feed is fed incrementally and the
manifest is guaranteed to reach 16/16 (failed slots retry with backoff; the reconciler
re-enqueues gaps and guarantees a fallback fill).

Concurrency model
-----------------
Jobs are claimed with ``FOR UPDATE SKIP LOCKED`` (durable, replica-safe). A drain pass
claims a *batch* of runnable slots (``_DRAIN_BATCH_SIZE``) and produces them in a SINGLE
``/api/auto-produce`` call:

* The per-workspace production lock is acquired **once** for the whole batch (no 409
  contention between slots of the same mission), and gallery photos are assigned in one
  pass across the batch — so concurrent slots can never collide on the same photo.
* Within the call, render-free slots (organic_post / carousel — gallery photo, no
  Remotion) complete immediately without waiting on the global Remotion render gate,
  while Remotion renders share an admission gate (default 2 parallel on 8+ core hosts).
* Per-batch setup (brand context, gallery probe, calendar / visual-design loads, LLM
  warmup) is amortized across the batch instead of repeated per slot.

Different missions still drain in parallel — each gets its own debounced asyncio task —
so the feed is fed without one mission's slots blocking another's.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

import structlog
from sqlalchemy import select

from app.services import production_job_service as jobs
from app.services.production_throughput import resolve_factory_drain_batch

logger = structlog.get_logger()

# Debounced per-mission completion pass (calendar + post→story after factory idle).
_scheduled_completion_tasks: dict[str, asyncio.Task] = {}
# Debounced per-mission factory drain tasks (in-process asyncio path).
_scheduled_drain_tasks: dict[str, asyncio.Task] = {}
# Throttle watchdog/callback force-drain storms (operator kicks bypass).
_last_drain_kick_monotonic: dict[str, float] = {}

# Hard cap on slots produced per drain pass (across all batches).
_MAX_SLOTS_PER_DRAIN = 30

# Cross-replica drain lock TTL. A single drain pass produces up to _MAX_SLOTS_PER_DRAIN
# slots (each may include a Remotion render); give the lock generous headroom so it
# auto-expires only if the worker dies, never mid-pass.
_DRAIN_LOCK_TTL_SEC = 1800


def _drain_batch_size(brand_theme: dict | None = None) -> int:
    """Slots claimed + produced per ``/api/auto-produce`` call.

    Default 1 — one slot per HTTP call keeps workspace/mission locks coherent and
    avoids fal.ai duplicate requests from parallel batch claims.
    Override via ``PRODUCTION_FACTORY_DRAIN_BATCH`` or brand_theme.production_engines.throughput.
    """
    return resolve_factory_drain_batch(brand_theme)


# ── Enqueue ────────────────────────────────────────────────────────────────────

async def enqueue_mission_jobs(
    *,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    brand: Any,
    feed_director_report: dict | None,
    mission_ctx: dict[str, str] | None = None,
) -> int:
    """Plan the manifest slots (no render) and upsert one durable job per slot.

    Returns the number of jobs newly inserted (idempotent — existing rows are kept).
    """
    from app.services.production_bridge import trigger_auto_produce as _trigger_auto_produce

    plan = await _trigger_auto_produce(
        workspace_id=workspace_id,
        mission_id=mission_id,
        node_key=node_key,
        output_summary=output_summary,
        brand=brand,
        feed_director_report=feed_director_report,
        mission_ctx=mission_ctx,
        plan_only=True,
    )
    slots = list((plan or {}).get("slots") or [])
    if not slots:
        plan_err = str((plan or {}).get("error") or "").strip()
        logger.warning(
            "production_factory.enqueue_no_slots",
            mission_id=str(mission_id),
            plan_error=plan_err[:200] or None,
        )
        raise RuntimeError(
            plan_err or "Plan returned no manifest slots — factory enqueue aborted"
        )

    inserted = await jobs.upsert_jobs(workspace_id, mission_id, node_key, slots)
    logger.info(
        "production_factory.enqueued",
        mission_id=str(mission_id),
        planned=len(slots),
        inserted=inserted,
    )
    return inserted


# ── Drain ────────────────────────────────────────────────────────────────────

def schedule_drain(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    delay_sec: float = 2.0,
    force: bool = False,
    bypass_throttle: bool = False,
) -> None:
    """Coalesce duplicate drain kicks into one debounced background task.

    When ``PRODUCTION_ORCHESTRATOR=celery`` the kick is dispatched to the Celery
    ``drain`` queue (cross-replica, durable) instead of an in-process asyncio task.

    ``bypass_throttle`` — operator kick / requeue paths skip the force-drain
    minimum interval (watchdog ticks remain throttled).
    """
    from app.services.production_automation import factory_drain_allowed

    if not factory_drain_allowed(force=force):
        logger.info(
            "production_factory.drain_skipped",
            mission_id=str(mission_id),
            reason="auto_feed_production_disabled",
        )
        return

    from app.config import get_settings

    settings = get_settings()
    key = str(mission_id)

    if force and not bypass_throttle:
        min_interval = float(settings.production_drain_force_min_interval_sec)
        last = _last_drain_kick_monotonic.get(key, 0.0)
        if min_interval > 0 and (time.monotonic() - last) < min_interval:
            logger.debug(
                "production_factory.drain_throttled",
                mission_id=str(mission_id),
                min_interval_sec=min_interval,
            )
            return

    if settings.use_celery_orchestrator:
        try:
            from app.tasks.drain_tasks import drain_mission

            drain_mission.apply_async(
                args=[str(mission_id), str(workspace_id)],
                countdown=max(0.0, delay_sec),
                queue="drain",
            )
            return
        except Exception as exc:  # pragma: no cover - fall back to asyncio if broker down
            logger.warning(
                "production_factory.celery_dispatch_failed_fallback_asyncio",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )

    existing = _scheduled_drain_tasks.get(key)
    if force and bypass_throttle and existing is not None and not existing.done():
        existing.cancel()
        _scheduled_drain_tasks.pop(key, None)
    elif not force and existing is not None and not existing.done():
        return

    _last_drain_kick_monotonic[key] = time.monotonic()

    async def _run() -> None:
        from app.services.redis_lock import distributed_lock

        try:
            if delay_sec > 0:
                await asyncio.sleep(delay_sec)
            # Cross-replica guard: only one process drains a given mission at a time.
            # Other replicas (or a later tick) skip and pick up remaining jobs next pass.
            async with distributed_lock(f"drain:{mission_id}", ttl_sec=_DRAIN_LOCK_TTL_SEC) as acquired:
                if not acquired:
                    logger.debug(
                        "production_factory.drain_skipped_locked",
                        mission_id=str(mission_id),
                    )
                    return
                await drain_production_jobs(mission_id, workspace_id)
        except Exception as exc:  # never crash the scheduler
            logger.warning(
                "production_factory.drain_task_failed",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )
        finally:
            _scheduled_drain_tasks.pop(key, None)

    _scheduled_drain_tasks[key] = asyncio.create_task(
        _run(), name=f"drain_production_jobs_{mission_id}"
    )


def schedule_completion_pass(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    delay_sec: float = 10.0,
) -> None:
    """Run post→story + calendar slot backfill when factory jobs are idle but package incomplete."""
    from app.services.production_automation import auto_feed_production_allowed

    if not auto_feed_production_allowed():
        return

    key = f"completion:{mission_id}"
    existing = _scheduled_completion_tasks.get(key)
    if existing is not None and not existing.done():
        return

    async def _run() -> None:
        try:
            if delay_sec > 0:
                await asyncio.sleep(delay_sec)
            await run_mission_completion_pass(mission_id, workspace_id)
        except Exception as exc:
            logger.warning(
                "production_factory.completion_pass_failed",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )
        finally:
            _scheduled_completion_tasks.pop(key, None)

    _scheduled_completion_tasks[key] = asyncio.create_task(
        _run(), name=f"completion_pass_{mission_id}"
    )


async def run_mission_completion_pass(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> dict | None:
    """Calendar + post→story backfill; requeue exhausted slots and resume drain if needed."""
    inputs = await _load_drain_inputs(workspace_id, mission_id)
    if not inputs:
        return None
    brand, node_key, output_summary, feed_director_report = inputs

    from app.services.production_trigger import trigger_mission_completion_pass

    result = await trigger_mission_completion_pass(
        workspace_id=workspace_id,
        mission_id=mission_id,
        node_key=node_key,
        output_summary=output_summary,
        brand=brand,
        feed_director_report=feed_director_report,
    )

    summary = await jobs.mission_job_summary(mission_id)
    if summary.get("complete"):
        return result

    requeued = await jobs.requeue_exhausted(mission_id)
    if requeued > 0 and await jobs.has_open_jobs(mission_id):
        schedule_drain(mission_id, workspace_id, delay_sec=30.0, force=True)
        logger.info(
            "production_factory.completion_pass_requeued",
            mission_id=str(mission_id),
            requeued=requeued,
        )
    return result


async def _load_drain_inputs(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
) -> tuple[Any, str, str, dict | None] | None:
    """(brand, node_key, output_summary, feed_director_report) for a mission, or None."""
    from app.services.brand_context_service import build_production_brand_context
    from app.services.mission_ideation_merge import (
        merge_mission_production_ideas_from_nodes,
    )
    from app.services.production_bridge import (
        get_session_factory as _get_session_factory,
        load_cached_feed_director_report as _load_cached_feed_director_report,
        load_content_calendar_nodes as _load_content_calendar_nodes,
        load_content_ideation_nodes as _load_content_ideation_nodes,
        load_mission_production_context as _load_mission_production_context,
    )

    factory = _get_session_factory()
    async with factory() as db:
        brand = await build_production_brand_context(db, workspace_id)
    if not brand:
        logger.warning("production_factory.no_brand", mission_id=str(mission_id))
        return None

    mission_ctx = await _load_mission_production_context(mission_id)
    mission_type = str((mission_ctx or {}).get("mission_type") or "") or None

    ideation_raw = await _load_content_ideation_nodes(mission_id)
    calendar_raw = await _load_content_calendar_nodes(mission_id)
    merged_json, ideas = merge_mission_production_ideas_from_nodes(
        [*ideation_raw, *calendar_raw],
        mission_type=mission_type,
    )
    if not ideas:
        logger.warning("production_factory.no_ideas", mission_id=str(mission_id))
        return None

    node_key = ideation_raw[-1]["node_key"] if ideation_raw else "content_ideation"
    summary = merged_json or str(ideation_raw[-1].get("output_summary") or "")
    fd_report = await _load_cached_feed_director_report(mission_id)
    return brand, node_key, summary, fd_report


def _slot_succeeded(produce_data: dict | None) -> bool:
    if not produce_data:
        return False
    return (
        int(produce_data.get("produced") or 0) > 0
        or int(produce_data.get("rendering") or 0) > 0
        or int(produce_data.get("publishReady") or 0) > 0
    )


def _artifact_id_from(produce_data: dict | None) -> str | None:
    for row in (produce_data or {}).get("results") or []:
        if isinstance(row, dict) and row.get("id"):
            return str(row["id"])
    return None


def _succeeded_slot_map(produce_data: dict | None) -> dict[str, str | None]:
    """Map each successfully-produced slot key → its artifact id.

    A batched backfill call returns one ``results`` row per attempted slot; rows that
    produced a persisted artifact carry ``slotKey`` (``"ideaIndex:slot_role"``) and an
    ``id``. Rows that were withheld carry an ``error`` and no ``id``, so they are absent
    from this map and their jobs are failed/retried by elimination.
    """
    out: dict[str, str | None] = {}
    for row in (produce_data or {}).get("results") or []:
        if not isinstance(row, dict):
            continue
        if row.get("error") or not row.get("id"):
            continue
        key = row.get("slotKey")
        if isinstance(key, str) and key:
            out[key] = str(row["id"])
    return out


def _slot_failure_map(produce_data: dict | None) -> dict[str, str]:
    """Map failed/withheld slot keys → human-readable error from auto-produce results."""
    out: dict[str, str] = {}
    for row in (produce_data or {}).get("results") or []:
        if not isinstance(row, dict):
            continue
        key = row.get("slotKey")
        if not isinstance(key, str) or not key:
            continue
        if row.get("id") and not row.get("error"):
            continue
        err = row.get("error") or row.get("skip_reason")
        if err:
            out[key] = str(err)[:500]
    return out


def _slot_error_code_map(produce_data: dict | None) -> dict[str, str]:
    """Map failed slot keys → machine-readable errorCode from auto-produce results."""
    out: dict[str, str] = {}
    for row in (produce_data or {}).get("results") or []:
        if not isinstance(row, dict):
            continue
        key = row.get("slotKey")
        code = row.get("errorCode")
        if not isinstance(key, str) or not key or not isinstance(code, str) or not code.strip():
            continue
        out[key] = code.strip()
    return out


GALLERY_THEME_MISMATCH_CODE = "gallery_theme_mismatch"
_NON_RETRYABLE_FAILURE_MARKERS = (
    "caption–görsel tema çatışması",
    "caption-görsel tema çatışması",
    "tema çatışması",
    GALLERY_THEME_MISMATCH_CODE,
)


def _is_non_retryable_slot_failure(
    reason: str,
    *,
    produce_data: dict | None = None,
    slot_key: str = "",
) -> bool:
    """Gallery theme gaps and similar errors cannot succeed without new gallery data."""
    lower = (reason or "").strip().lower()
    if any(marker in lower for marker in _NON_RETRYABLE_FAILURE_MARKERS):
        return True
    if slot_key:
        failures = _slot_failure_map(produce_data)
        row_error = failures.get(slot_key, "")
        codes = _slot_error_code_map(produce_data)
        if (
            row_error
            and (reason or "").strip() == row_error.strip()
            and codes.get(slot_key, "").strip().lower() == GALLERY_THEME_MISMATCH_CODE
        ):
            return True
    return False


async def _mark_slot_failed(
    job_id: uuid.UUID | str,
    produce_data: dict | None,
    slot_key: str,
    batch_reason: str,
) -> str:
    slot_reason = _resolve_slot_failure_reason(produce_data, slot_key, batch_reason)
    retryable = not _is_non_retryable_slot_failure(
        slot_reason,
        produce_data=produce_data,
        slot_key=slot_key,
    )
    return await jobs.mark_failed(job_id, slot_reason, retryable=retryable)


def _resolve_slot_failure_reason(
    produce_data: dict | None,
    slot_key: str,
    batch_reason: str,
) -> str:
    """Prefer per-slot auto-produce error over generic batch_reason/no_artifact."""
    per_slot = _slot_failure_map(produce_data)
    if slot_key in per_slot:
        return per_slot[slot_key]
    if batch_reason and batch_reason not in ("no_artifact", ""):
        return batch_reason[:500]
    withheld = int((produce_data or {}).get("withheld") or 0)
    produced = int((produce_data or {}).get("produced") or 0)
    if withheld > 0 and produced == 0:
        return "withheld_quality_gate"
    return batch_reason or "no_artifact"


def _gallery_assignments_from_batch(batch: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Map factory job payloads → Next.js gallerySlotAssignments (``ideaIndex::slot_role`` keys)."""
    out: dict[str, dict[str, Any]] = {}
    for job in batch:
        payload = job.get("payload")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        if not isinstance(payload, dict):
            payload = {}
        url = str(payload.get("galleryPhotoUrl") or payload.get("gallery_photo_url") or "").strip()
        if not url:
            continue
        key = f"{job['idea_index']}::{job['slot_role']}"
        score = payload.get("galleryMatchScore")
        out[key] = {
            "url": url,
            "score": score if isinstance(score, (int, float)) else None,
        }
    return out


async def drain_production_jobs(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    max_slots: int = _MAX_SLOTS_PER_DRAIN,
) -> dict[str, int]:
    """Claim runnable slots in small batches and produce each batch in one backfill call.

    Each ``/api/auto-produce`` call produces ``_drain_batch_size()`` slots together:
    gallery photos are assigned across the batch in a single collision-free pass, the
    per-workspace lock is taken once, and render-free slots finish without waiting on the
    Remotion render gate. Results are mapped back to jobs by ``slotKey``. Restart-safe —
    a crash leaves jobs claimed and a later tick reclaims them (stale-claim window).
    """
    from app.config import get_settings
    from app.services.production_bridge import trigger_auto_produce as _trigger_auto_produce

    settings = get_settings()
    use_bullmq = settings.use_bullmq_executor

    if not await jobs.has_open_jobs(mission_id):
        return {"claimed": 0, "ready": 0, "failed": 0}

    # Recover slots stuck in running/claimed after worker crash, dev reload, or a hung
    # auto-produce HTTP call — without this, the queue freezes until the stale window.
    reclaim_stale_sec = (
        jobs._BULLMQ_DRAIN_STALE_RECLAIM_SEC
        if use_bullmq
        else jobs._FACTORY_DRAIN_STALE_RECLAIM_SEC
    )

    reclaimed = await jobs.reclaim_stale_jobs(
        mission_id, stale_sec=reclaim_stale_sec
    )
    if reclaimed:
        logger.info(
            "production_factory.reclaim_stale",
            mission_id=str(mission_id),
            reclaimed=reclaimed,
        )

    inputs = await _load_drain_inputs(workspace_id, mission_id)
    if not inputs:
        return {"claimed": 0, "ready": 0, "failed": 0}
    brand, node_key, summary, fd_report = inputs

    use_bullmq = settings.use_bullmq_executor
    theme = getattr(brand, "brand_theme", None)
    batch_size = _drain_batch_size(theme if isinstance(theme, dict) else None)
    claim_stale_sec = (
        jobs._BULLMQ_WATCHDOG_STALE_SEC if use_bullmq else jobs._STALE_CLAIM_SEC
    )
    claimed_total = ready_total = failed_total = enqueued_total = 0
    while claimed_total < max_slots:
        limit = min(batch_size, max_slots - claimed_total)
        batch = await jobs.claim_batch(mission_id, limit=limit, stale_sec=claim_stale_sec)
        if not batch:
            break
        claimed_total += len(batch)
        slot_keys = [f"{job['idea_index']}:{job['slot_role']}" for job in batch]
        gallery_slot_assignments = _gallery_assignments_from_batch(batch)

        # ── BullMQ executor: enqueue claimed batch, leave jobs 'running' ─────
        # The Next.js worker executes the pipeline and calls back to mark each
        # job ready/failed. A worker crash leaves jobs claimed → stale window
        # reclaims them on a later tick.
        if use_bullmq:
            factory_jobs = [
                {"id": str(job["id"]), "slotKey": key}
                for job, key in zip(batch, slot_keys)
            ]
            batch_priority = max(int(job.get("priority") or 0) for job in batch) if batch else 0
            try:
                eq = await _trigger_auto_produce(
                    workspace_id=workspace_id,
                    mission_id=mission_id,
                    node_key=node_key,
                    output_summary=summary,
                    brand=brand,
                    feed_director_report=fd_report,
                    backfill_slot_keys=slot_keys,
                    enqueue_only=True,
                    factory_jobs=factory_jobs,
                    gallery_slot_assignments=gallery_slot_assignments or None,
                    enqueue_priority=batch_priority or None,
                )
            except Exception as exc:
                eq = None
                logger.warning(
                    "production_factory.enqueue_exception",
                    mission_id=str(mission_id),
                    slots=slot_keys,
                    error=str(exc)[:200],
                )
            if eq and eq.get("reason") == "enqueued_to_bullmq":
                for job in batch:
                    await jobs.mark_running(job["id"])
                enqueued_total += len(batch)
                # One batch in flight per mission — worker holds the production lock;
                # enqueueing more batches here only yields 409 deferred loops.
                break
            # Enqueue failed — defer transient lock/queue errors; fail hard only on unknown.
            eq_reason = str((eq or {}).get("reason") or "bullmq enqueue failed")
            if eq_reason in _bullmq_defer_reasons() or eq is None:
                delay = _bullmq_defer_delay_sec(eq_reason)
                for job in batch:
                    await jobs.mark_deferred(job["id"], eq_reason, delay_sec=delay)
            else:
                for job in batch:
                    await jobs.mark_failed(job["id"], eq_reason[:500])
                failed_total += len(batch)
            continue

        for job in batch:
            await jobs.mark_running(job["id"])

        try:
            produce_data = await _trigger_auto_produce(
                workspace_id=workspace_id,
                mission_id=mission_id,
                node_key=node_key,
                output_summary=summary,
                brand=brand,
                feed_director_report=fd_report,
                backfill_slot_keys=slot_keys,
                gallery_slot_assignments=gallery_slot_assignments or None,
            )
        except Exception as exc:
            for job in batch:
                await jobs.mark_failed(job["id"], f"drain exception: {exc}"[:500])
            failed_total += len(batch)
            logger.warning(
                "production_factory.batch_exception",
                mission_id=str(mission_id),
                slots=slot_keys,
                error=str(exc)[:200],
            )
            continue

        # Per-slot outcome: a slot is ready iff its key produced a persisted artifact.
        ok_map = _succeeded_slot_map(produce_data)
        # Fallback for older single-slot responses without slotKey: if exactly one slot
        # was claimed and the run produced something, attribute that artifact to it.
        if not ok_map and len(batch) == 1 and _slot_succeeded(produce_data):
            ok_map[slot_keys[0]] = _artifact_id_from(produce_data)
        batch_reason = str((produce_data or {}).get("reason") or "no_artifact")

        # region agent log
        try:
            from app.debug_session_log import debug_log as _debug_log

            _debug_log(
                "H1",
                "production_factory_service.py:drain_batch",
                "batch produce outcome",
                {
                    "mission_id": str(mission_id),
                    "slot_keys": slot_keys,
                    "ok_keys": list(ok_map.keys()),
                    "batch_reason": batch_reason,
                    "produced": int((produce_data or {}).get("produced") or 0),
                    "withheld": int((produce_data or {}).get("withheld") or 0),
                },
            )
        except Exception:
            pass
        # endregion

        if batch_reason == "production_in_flight":
            for job in batch:
                await jobs.mark_deferred(job["id"], batch_reason, delay_sec=45.0)
            logger.info(
                "production_factory.batch_deferred",
                mission_id=str(mission_id),
                slots=slot_keys,
                reason=batch_reason,
            )
        else:
            for job, key in zip(batch, slot_keys):
                if key in ok_map:
                    await jobs.mark_ready(job["id"], artifact_id=ok_map[key])
                    ready_total += 1
                    logger.info(
                        "production_factory.slot_ready",
                        mission_id=str(mission_id),
                        slot=key,
                    )
                else:
                    slot_reason = _resolve_slot_failure_reason(produce_data, key, batch_reason)
                    status = await _mark_slot_failed(job["id"], produce_data, key, batch_reason)
                    failed_total += 1
                    logger.info(
                        "production_factory.slot_failed",
                        mission_id=str(mission_id),
                        slot=key,
                        reason=slot_reason,
                        status=status,
                    )

        # Another drain pass is already in flight — do not claim more slots this round.
        if batch_reason in ("production_in_flight", "enqueued_to_factory"):
            break

    summary_after = await _finalize_mission_production_state(mission_id)

    logger.info(
        "production_factory.drain_done",
        mission_id=str(mission_id),
        claimed=claimed_total,
        ready=ready_total,
        failed=failed_total,
        enqueued=enqueued_total,
        total=summary_after["total"],
        complete=summary_after["complete"],
    )

    # Continuation kicks — BullMQ relies on worker callbacks; schedule a safety-net
    # drain when open jobs remain so slots do not freeze if the callback never arrives.
    if use_bullmq:
        if await jobs.has_open_jobs(mission_id):
            delay = 45.0 if enqueued_total > 0 else 2.0
            schedule_drain(mission_id, workspace_id, delay_sec=delay, force=True)
        elif (
            not summary_after.get("complete")
            and int(summary_after.get("ready") or 0) < int(summary_after.get("total") or 0)
            and int(summary_after.get("active") or 0) == 0
        ):
            schedule_completion_pass(mission_id, workspace_id, delay_sec=12.0)
    elif await jobs.has_open_jobs(mission_id):
        # Longer delay when slots failed without artifacts — avoids fal.ai retry storms.
        delay = 120.0 if failed_total > 0 and ready_total == 0 else 45.0
        schedule_drain(mission_id, workspace_id, delay_sec=delay, force=True)
    elif (
        not summary_after.get("complete")
        and int(summary_after.get("ready") or 0) < int(summary_after.get("total") or 0)
        and int(summary_after.get("active") or 0) == 0
    ):
        # Factory idle but manifest incomplete — calendar/post→story completion pass.
        schedule_completion_pass(mission_id, workspace_id, delay_sec=12.0)

    return {
        "claimed": claimed_total,
        "ready": ready_total,
        "failed": failed_total,
        "enqueued": enqueued_total,
    }


async def _finalize_mission_production_state(mission_id: uuid.UUID) -> dict:
    """Recompute the job summary, sync mission perf, and persist production_state.

    Shared by the synchronous drain (HTTP executor) and the BullMQ completion
    callback so both keep ``_mission_feed_package_complete`` + the Hub debug panel
    accurate. Returns the fresh ``mission_job_summary``.
    """
    summary_after = await jobs.mission_job_summary(mission_id)

    production_state = "idle"
    if summary_after["total"] > 0:
        if summary_after.get("complete"):
            production_state = "complete"
        elif summary_after["active"] > 0:
            production_state = "draining"
        elif int(summary_after.get("failed") or 0) >= summary_after["total"]:
            production_state = "exhausted"
        else:
            production_state = "queued"

    if summary_after["total"] > 0:
        try:
            from app.services.production_bridge import (
                record_mission_feed_produce_success as _record_mission_feed_produce_success,
            )

            await _record_mission_feed_produce_success(
                mission_id,
                produced=summary_after["ready"],
                publish_ready=summary_after["ready"],
                rendering=int(summary_after.get("inFlight") or 0),
                manifest_ready=summary_after["ready"],
                required_total=summary_after["total"],
            )
        except Exception as exc:
            logger.warning(
                "production_factory.perf_update_failed",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )

    try:
        from datetime import datetime, timezone as tz
        from sqlalchemy import update as sa_update

        from app.models.mission import Mission as MissionModel
        from app.services.production_bridge import get_session_factory as _get_session_factory

        _factory = _get_session_factory()
        async with _factory() as db:
            r = await db.execute(
                select(MissionModel.performance_summary).where(MissionModel.id == mission_id)
            )
            row = r.first()
            perf = dict(row[0] or {}) if row else {}
            perf["production_state"] = production_state
            perf["last_drain_at"] = datetime.now(tz.utc).isoformat()
            perf["slots_ready"] = summary_after["ready"]
            perf["slots_total"] = summary_after["total"]
            await db.execute(
                sa_update(MissionModel)
                .where(MissionModel.id == mission_id)
                .values(performance_summary=perf)
            )
            await db.commit()
    except Exception as exc:
        logger.warning(
            "production_factory.state_persist_failed",
            mission_id=str(mission_id),
            error=str(exc)[:200],
        )

    if summary_after.get("complete"):
        try:
            from app.services.task_graph_executor import try_complete_mission_when_factory_done

            await try_complete_mission_when_factory_done(mission_id)
        except Exception as exc:
            logger.warning(
                "production_factory.mission_complete_failed",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )

    return summary_after


def _resolve_bullmq_batch_reason(
    produce_data: dict | None,
    http_status: int | None = None,
) -> str:
    """Map worker HTTP status + auto-produce body → batch reason for slot disposition."""
    if http_status == 409:
        return "production_in_flight"
    if http_status == 0:
        err = str((produce_data or {}).get("error") or "").strip()
        return err[:500] if err else "auto_produce_unreachable"
    code = str((produce_data or {}).get("code") or "")
    if code in ("mission_production_in_progress", "production_in_progress"):
        return "production_in_flight"
    reason = str((produce_data or {}).get("reason") or "")
    if reason == "production_in_flight":
        return reason
    if http_status and http_status >= 400 and not reason:
        err = str((produce_data or {}).get("error") or "")
        if err:
            return err[:500]
    return reason or "no_artifact"


def _bullmq_defer_delay_sec(reason: str) -> float:
    """Backoff before re-claiming deferred BullMQ slots."""
    if reason == "production_in_flight":
        return 45.0
    if reason == "auto_produce_unreachable":
        return 20.0
    if reason in {"enqueue_failed", "bullmq enqueue failed"}:
        return 30.0
    return 45.0


def _bullmq_defer_reasons() -> frozenset[str]:
    return frozenset({
        "production_in_flight",
        "auto_produce_unreachable",
        "enqueue_failed",
        "bullmq enqueue failed",
        "route_still_running",
    })


async def apply_bullmq_completion(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    factory_jobs: list[dict],
    produce_data: dict | None,
    *,
    http_status: int | None = None,
) -> dict:
    """Mark claimed jobs ready/failed from a BullMQ worker callback.

    Mirrors the synchronous drain's per-slot outcome logic: a slot is ready iff its
    ``slotKey`` produced a persisted artifact. Then re-syncs mission state and, if
    open jobs remain, schedules the next drain pass (claim + enqueue more).
    """
    ok_map = _succeeded_slot_map(produce_data)
    slot_keys = [str(fj.get("slotKey") or "") for fj in factory_jobs]
    # Single-slot fallback for older responses without slotKey.
    if not ok_map and len(factory_jobs) == 1 and _slot_succeeded(produce_data):
        ok_map[slot_keys[0]] = _artifact_id_from(produce_data)
    reason = _resolve_bullmq_batch_reason(produce_data, http_status)

    ready = failed = deferred = 0
    defer_reasons = _bullmq_defer_reasons()
    if reason in defer_reasons:
        delay = _bullmq_defer_delay_sec(reason)
        for fj in factory_jobs:
            job_id = fj.get("id")
            if not job_id:
                continue
            try:
                job_uuid = uuid.UUID(str(job_id))
            except (ValueError, TypeError):
                continue
            await jobs.mark_deferred(job_uuid, reason, delay_sec=delay)
            deferred += 1
    else:
        for fj in factory_jobs:
            job_id = fj.get("id")
            key = str(fj.get("slotKey") or "")
            if not job_id:
                continue
            try:
                job_uuid = uuid.UUID(str(job_id))
            except (ValueError, TypeError):
                continue
            if key in ok_map:
                await jobs.mark_ready(job_uuid, artifact_id=ok_map[key])
                ready += 1
            else:
                slot_reason = _resolve_slot_failure_reason(produce_data, key, reason)
                await _mark_slot_failed(job_uuid, produce_data, key, reason)
                failed += 1

    summary_after = await _finalize_mission_production_state(mission_id)

    logger.info(
        "production_factory.bullmq_callback_applied",
        mission_id=str(mission_id),
        ready=ready,
        failed=failed,
        deferred=deferred,
        http_status=http_status,
        complete=summary_after.get("complete"),
    )

    # Claim + enqueue any remaining runnable jobs for this mission.
    if not summary_after.get("complete") and await jobs.has_open_jobs(mission_id):
        # Match mark_deferred backoff — avoid enqueue storms while lock is held.
        delay = 45.0 if deferred > 0 else 2.0
        schedule_drain(mission_id, workspace_id, delay_sec=delay, force=True)

    return {
        "ready": ready,
        "failed": failed,
        "deferred": deferred,
        "complete": summary_after.get("complete"),
    }


async def drain_all_open_missions(limit: int | None = None) -> int:
    """Scheduler tick: resume draining missions with runnable jobs.

    Runs even when ``AUTO_FEED_PRODUCTION_ENABLED=false`` — only missions that
    already have open ``production_jobs`` rows are touched (no new feed starts).

    Enforces workspace-level serialization: only N missions per workspace drain
    concurrently (default 1 via PRODUCTION_MAX_CONCURRENT_PER_WORKSPACE).
    This prevents fal/Remotion parallel storms across missions of the same tenant.

    When ``production_fair_share_enabled``, open missions are chosen one per
    workspace (oldest wait first) so a single tenant cannot monopolize the tick.
    """
    from app.config import get_settings

    settings = get_settings()
    max_per_ws = settings.production_max_concurrent_per_workspace
    tick_limit = int(limit if limit is not None else settings.production_drain_tick_limit)

    mission_ids = await jobs.list_missions_with_open_jobs(limit=tick_limit)
    drained = 0
    ws_counts: dict[str, int] = {}

    for mid in mission_ids:
        workspace_id = await _workspace_for_mission(uuid.UUID(mid))
        if not workspace_id:
            continue
        ws_key = str(workspace_id)
        current = ws_counts.get(ws_key, 0)
        if current >= max_per_ws:
            continue
        ws_counts[ws_key] = current + 1
        schedule_drain(uuid.UUID(mid), workspace_id, delay_sec=0.0, force=True)
        drained += 1
    if drained:
        logger.info("production_factory.tick_drained", missions=drained)
    return drained


async def run_factory_watchdog_tick(*, reclaim_limit: int = 50) -> dict[str, int]:
    """Reclaim orphaned running rows and schedule drains for open missions.

    Celery Beat is often off in dev — this asyncio tick prevents slots stuck in
    ``running`` with an empty BullMQ queue and an idle worker.
    """
    from app.config import get_settings

    settings = get_settings()
    stale_sec = (
        jobs._BULLMQ_WATCHDOG_STALE_SEC
        if settings.use_bullmq_executor
        else jobs._FACTORY_DRAIN_STALE_RECLAIM_SEC
    )

    reclaimed = 0
    for mid in await jobs.list_mission_ids_with_any_open_jobs(limit=reclaim_limit):
        reclaimed += await jobs.reclaim_stale_jobs(uuid.UUID(mid), stale_sec=stale_sec)

    drained = await drain_all_open_missions(limit=reclaim_limit)

    if reclaimed or drained:
        logger.info(
            "production_factory.watchdog_tick",
            reclaimed=reclaimed,
            missions_scheduled=drained,
        )

    return {"reclaimed": reclaimed, "drained": drained}


async def _workspace_for_mission(mission_id: uuid.UUID) -> uuid.UUID | None:
    from sqlalchemy import select

    from app.models.mission import Mission
    from app.services.production_bridge import get_session_factory as _get_session_factory

    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.workspace_id).where(Mission.id == mission_id)
        )
        row = r.first()
        return row[0] if row else None
