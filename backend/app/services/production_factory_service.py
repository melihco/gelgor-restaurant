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
import uuid
from typing import Any

import structlog
from sqlalchemy import select

from app.services import production_job_service as jobs
from app.services.production_throughput import resolve_factory_drain_batch

logger = structlog.get_logger()

# Debounced per-mission drain tasks (mirror _scheduled_ensure_tasks pattern).
_scheduled_drain_tasks: dict[str, asyncio.Task] = {}

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
        logger.warning("production_factory.enqueue_no_slots", mission_id=str(mission_id))
        return 0

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
) -> None:
    """Coalesce duplicate drain kicks into one debounced background task.

    When ``PRODUCTION_ORCHESTRATOR=celery`` the kick is dispatched to the Celery
    ``drain`` queue (cross-replica, durable) instead of an in-process asyncio task.
    """
    from app.services.production_automation import auto_feed_production_allowed

    if not force and not auto_feed_production_allowed():
        logger.info(
            "production_factory.drain_skipped",
            mission_id=str(mission_id),
            reason="auto_feed_production_disabled",
        )
        return

    from app.config import get_settings

    if get_settings().use_celery_orchestrator:
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

    key = str(mission_id)
    existing = _scheduled_drain_tasks.get(key)
    if not force and existing is not None and not existing.done():
        return

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

    if not await jobs.has_open_jobs(mission_id):
        return {"claimed": 0, "ready": 0, "failed": 0}

    inputs = await _load_drain_inputs(workspace_id, mission_id)
    if not inputs:
        return {"claimed": 0, "ready": 0, "failed": 0}
    brand, node_key, summary, fd_report = inputs

    use_bullmq = get_settings().use_bullmq_executor
    theme = getattr(brand, "brand_theme", None)
    batch_size = _drain_batch_size(theme if isinstance(theme, dict) else None)
    claimed_total = ready_total = failed_total = enqueued_total = 0
    while claimed_total < max_slots:
        limit = min(batch_size, max_slots - claimed_total)
        batch = await jobs.claim_batch(mission_id, limit=limit)
        if not batch:
            break
        claimed_total += len(batch)
        slot_keys = [f"{job['idea_index']}:{job['slot_role']}" for job in batch]
        for job in batch:
            await jobs.mark_running(job["id"])

        # ── BullMQ executor: enqueue claimed batch, leave jobs 'running' ─────
        # The Next.js worker executes the pipeline and calls back to mark each
        # job ready/failed. A worker crash leaves jobs claimed → stale window
        # reclaims them on a later tick.
        if use_bullmq:
            factory_jobs = [
                {"id": str(job["id"]), "slotKey": key}
                for job, key in zip(batch, slot_keys)
            ]
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
                enqueued_total += len(batch)
                continue
            # Enqueue failed — fail the batch so a later tick retries with backoff.
            for job in batch:
                await jobs.mark_failed(job["id"], "bullmq enqueue failed")
            failed_total += len(batch)
            continue

        try:
            produce_data = await _trigger_auto_produce(
                workspace_id=workspace_id,
                mission_id=mission_id,
                node_key=node_key,
                output_summary=summary,
                brand=brand,
                feed_director_report=fd_report,
                backfill_slot_keys=slot_keys,
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
                    status = await jobs.mark_failed(job["id"], batch_reason)
                    failed_total += 1
                    logger.info(
                        "production_factory.slot_failed",
                        mission_id=str(mission_id),
                        slot=key,
                        reason=batch_reason,
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

    # More runnable work (failed slots in backoff or unclaimed) — re-kick later.
    # In BullMQ mode the worker callback owns completion; we just enqueued this
    # batch, so a local re-kick would only claim nothing (jobs are 'running').
    # The periodic drain tick handles any genuinely remaining/backoff jobs.
    if not use_bullmq and await jobs.has_open_jobs(mission_id):
        # Longer delay when slots failed without artifacts — avoids fal.ai retry storms.
        delay = 120.0 if failed_total > 0 and ready_total == 0 else 45.0
        schedule_drain(mission_id, workspace_id, delay_sec=delay)

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
                rendering=summary_after["active"],
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

    return summary_after


async def apply_bullmq_completion(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    factory_jobs: list[dict],
    produce_data: dict | None,
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
    reason = str((produce_data or {}).get("reason") or "no_artifact")

    ready = failed = 0
    if reason == "production_in_flight":
        for fj in factory_jobs:
            job_id = fj.get("id")
            if not job_id:
                continue
            try:
                job_uuid = uuid.UUID(str(job_id))
            except (ValueError, TypeError):
                continue
            await jobs.mark_deferred(job_uuid, reason, delay_sec=45.0)
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
                await jobs.mark_failed(job_uuid, reason)
                failed += 1

    summary_after = await _finalize_mission_production_state(mission_id)

    logger.info(
        "production_factory.bullmq_callback_applied",
        mission_id=str(mission_id),
        ready=ready,
        failed=failed,
        complete=summary_after.get("complete"),
    )

    # Claim + enqueue any remaining runnable jobs for this mission.
    if not summary_after.get("complete") and await jobs.has_open_jobs(mission_id):
        schedule_drain(mission_id, workspace_id, delay_sec=2.0)

    return {"ready": ready, "failed": failed, "complete": summary_after.get("complete")}


async def drain_all_open_missions(limit: int = 25) -> int:
    """Scheduler tick: resume draining missions with runnable jobs.

    Enforces workspace-level serialization: only N missions per workspace drain
    concurrently (default 1 via PRODUCTION_MAX_CONCURRENT_PER_WORKSPACE).
    This prevents fal/Remotion parallel storms across missions of the same tenant.
    """
    from app.services.production_automation import auto_feed_production_allowed

    if not auto_feed_production_allowed():
        return 0

    from app.config import get_settings

    settings = get_settings()
    max_per_ws = settings.production_max_concurrent_per_workspace

    mission_ids = await jobs.list_missions_with_open_jobs(limit=limit)
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
        schedule_drain(uuid.UUID(mid), workspace_id, delay_sec=0.0)
        drained += 1
    if drained:
        logger.info("production_factory.tick_drained", missions=drained)
    return drained


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
