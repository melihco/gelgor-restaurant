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
# Product cap. Requeue / kick used to raise max_attempts to 12 so the same
# slot painted 7–8 times while attempts still read 3/12.
HARD_SLOT_ATTEMPT_CAP = 3


def _attempts_under_cap_sql(alias: str = "j") -> str:
    col = f"{alias}." if alias else ""
    return (
        f"{col}attempts < LEAST(COALESCE({col}max_attempts, {HARD_SLOT_ATTEMPT_CAP}), "
        f"{HARD_SLOT_ATTEMPT_CAP})"
    )

# Same inputs cannot succeed: empty wallet, missing pack, look failed.
# claim_batch / requeue / watchdog must not send these through auto-produce again.
TERMINAL_PRODUCE_ERROR_MARKERS: tuple[str, ...] = (
    "paket yok",
    "paket yarım",
    "incomplete_pack",
    "galeri eşleşmesi yok",
    "galeri–caption eşleşmesi",
    "galeri-caption eşleşmesi",
    "uyumlu marka fotoğrafı bulunamadı",
    "tema çatışması",
    "hero reel slot assigned",
    "bakış yapılamadı",
    "görseldeki metin doğrulanamadı",
    "balance exhausted",
    "exhausted balance",
    "no credits remaining",
    "insufficient_quota",
    "user is locked",
    "aylık kredi",
    "budget_exhausted",
    "token_wallet",
    "ops-terminated",
    "library_template_required",
    "library_template_replica_required",
    "gpt-image exhausted",
)

# Look ops flake / provider lock — do not let one workspace keep the only paint lane.
LANE_LOOK_OPS_MARKERS: tuple[str, ...] = (
    "bakış çağrısı",
    "fotoğraf açılamadı",
    "look_call_failed",
    "look_vision_blocked",
)
# GPT still-lane. Fal/Ideogram wallet lock must not park posts/stories.
LANE_STILL_PROVIDER_MARKERS: tuple[str, ...] = (
    "gpt-image exhausted",
    "insufficient_quota",
)
LANE_VIDEO_PROVIDER_MARKERS: tuple[str, ...] = (
    "user is locked",
    "provider_billing_circuit_open",
    "skip-no-fal-quota",
    "balance exhausted",
    "exhausted balance",
    "no credits remaining",
)
LANE_PROVIDER_MARKERS: tuple[str, ...] = (
    LANE_STILL_PROVIDER_MARKERS + LANE_VIDEO_PROVIDER_MARKERS
)
LANE_LOOK_OPS_COOLDOWN_SEC = 180
LANE_PROVIDER_COOLDOWN_SEC = 600
LANE_LOOK_OPS_BACKOFF_SEC = 180
# In-call look already retries once. Two factory tours max — not three.
LOOK_OPS_ATTEMPT_CAP = 2

# A new paint can differ — never treat these as terminal, even if a marker overlaps.
RETRYABLE_PRODUCE_ERROR_MARKERS: tuple[str, ...] = (
    "quality_hard_block",
    "caption_design_incoherent",
    "tasarım kalitesi onay için yeterli değil",
    "yazı, foto ve başlık",
    "yazı, şablon ve başlık",
    "reel_video_required",
    "reel için video gerekli",
    "designed_visual_required",
    "bundle_failed",
    "bakış çağrısı",
    "fotoğraf açılamadı",
    "look_call_failed",
    "look_vision_blocked",
)


def is_retryable_publish_error(reason: str | None) -> bool:
    lower = (reason or "").strip().lower()
    return bool(lower) and any(marker in lower for marker in RETRYABLE_PRODUCE_ERROR_MARKERS)


def is_terminal_produce_error(reason: str | None) -> bool:
    if is_retryable_publish_error(reason):
        return False
    lower = (reason or "").strip().lower()
    return bool(lower) and any(marker in lower for marker in TERMINAL_PRODUCE_ERROR_MARKERS)


def is_lane_blocker_look_ops(reason: str | None) -> bool:
    lower = (reason or "").strip().lower()
    return bool(lower) and any(marker in lower for marker in LANE_LOOK_OPS_MARKERS)


def is_lane_blocker_provider(reason: str | None) -> bool:
    if is_lane_blocker_look_ops(reason):
        return False
    lower = (reason or "").strip().lower()
    return bool(lower) and any(marker in lower for marker in LANE_PROVIDER_MARKERS)


def is_lane_blocker_reason(reason: str | None) -> bool:
    return is_lane_blocker_look_ops(reason) or is_lane_blocker_provider(reason)


def resolve_failure_attempt_cap(reason: str | None) -> int:
    """Look flake: 2 factory tours. Pack / paint errors keep the product cap."""
    if is_lane_blocker_look_ops(reason):
        return LOOK_OPS_ATTEMPT_CAP
    return HARD_SLOT_ATTEMPT_CAP


REEL_PAUSE_SKIP_REASON = "skip-no-fal-quota: reel paused until fal wallet"


def reel_production_paused() -> bool:
    """Skip reel/fal jobs until the fal wallet is funded.

    Default on. Set ``REEL_PRODUCTION_PAUSED=0`` to claim reels again.
    """
    import os

    raw = os.getenv("REEL_PRODUCTION_PAUSED", "1").strip().lower()
    return raw not in ("0", "false", "off", "no")


def is_reel_job(job: dict[str, Any] | None = None, **fields: Any) -> bool:
    """Weekly swipe (post/story/carousel) vs reel/video lane."""
    src = job or {}
    hay = " ".join(
        str(src.get(key) or fields.get(key) or "")
        for key in ("slot_key", "slot_role", "format", "pipeline")
    ).lower()
    return "reel" in hay


def _reel_job_sql(alias: str = "j") -> str:
    a = alias
    return (
        f"("
        f"COALESCE({a}.slot_key, '') ILIKE '%reel%' "
        f"OR COALESCE({a}.slot_role, '') ILIKE '%reel%' "
        f"OR COALESCE({a}.format, '') ILIKE '%reel%' "
        f"OR COALESCE({a}.pipeline, '') ILIKE '%reel%'"
        f")"
    )


def workspace_lane_cooldown_sql(
    workspace_col: str = "workspace_id",
    *,
    look_sec: int = LANE_LOOK_OPS_COOLDOWN_SEC,
    provider_sec: int = LANE_PROVIDER_COOLDOWN_SEC,
) -> str:
    """Exclude workspaces that burned the still lane (look flake / GPT lock).

    Fal/Ideogram wallet deaths stay on the video claim filter so a reel 403
    does not hide the weekly swipe for the whole brand.
    """
    look = " OR ".join(
        f"COALESCE(last_error, '') ILIKE '%{m}%'" for m in LANE_LOOK_OPS_MARKERS
    )
    provider = " OR ".join(
        f"COALESCE(last_error, '') ILIKE '%{m}%'" for m in LANE_STILL_PROVIDER_MARKERS
    )
    return f"""
    {workspace_col} NOT IN (
      SELECT workspace_id FROM production_jobs
      WHERE updated_at > now() - make_interval(secs => {int(look_sec)})
        AND ({look})
    )
    AND {workspace_col} NOT IN (
      SELECT workspace_id FROM production_jobs
      WHERE updated_at > now() - make_interval(secs => {int(provider_sec)})
        AND ({provider})
    )
    """


def _video_lane_cooldown_sql(
    workspace_col: str = "j.workspace_id",
    *,
    provider_sec: int = LANE_PROVIDER_COOLDOWN_SEC,
) -> str:
    """Reel claim only — fal wallet lock must not park stills."""
    provider = " OR ".join(
        f"COALESCE(last_error, '') ILIKE '%{m}%'" for m in LANE_VIDEO_PROVIDER_MARKERS
    )
    return f"""
    (
      NOT ({_reel_job_sql("j")})
      OR {workspace_col} NOT IN (
        SELECT workspace_id FROM production_jobs
        WHERE updated_at > now() - make_interval(secs => {int(provider_sec)})
          AND ({provider})
      )
    )
    """


def _terminal_error_sql(column: str = "last_error") -> str:
    """SQL mirror of ``is_terminal_produce_error`` — retryable markers win.

    ``Bakış yapılamadı (bakış çağrısı)`` contains both a terminal stem
    (bakış yapılamadı) and a retryable stem (bakış çağrısı). Without the
    exclusion, the sweeper ops-terminates a flaky look call on attempt 1.
    """
    terminal = " OR ".join(
        f"COALESCE({column}, '') ILIKE '%{marker}%'"
        for marker in TERMINAL_PRODUCE_ERROR_MARKERS
    )
    retryable = " AND ".join(
        f"COALESCE({column}, '') NOT ILIKE '%{marker}%'"
        for marker in RETRYABLE_PRODUCE_ERROR_MARKERS
    )
    return f"(({terminal}) AND ({retryable}))"

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
# BullMQ drain: reclaim running rows only after a long produce can finish.
# Editorial stories routinely take 6–10 min; 3 min reclaim overlapped live
# workers and re-painted the same story (Karaman idea 12, 2026-09-05).
_BULLMQ_DRAIN_STALE_RECLAIM_SEC = 900  # 15 min — above editorial + persist
# Same window as drain reclaim. 11 min overlapped live paints (Next max 10 min +
# persist) and re-claimed the same story/post — two JPEGs, vitrin flicker.
_BULLMQ_WATCHDOG_STALE_SEC = _BULLMQ_DRAIN_STALE_RECLAIM_SEC
# Deploy / crash: worker never callbacks. Only claimed+running events = silent.
# Posts finish or fail before 10 min; remotion reels keep the 15 min window.
_SILENT_POST_INFLIGHT_SEC = 600

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
    max_attempts: int = HARD_SLOT_ATTEMPT_CAP,
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
                    "max_attempts": min(int(max_attempts), HARD_SLOT_ATTEMPT_CAP),
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


def _live_inflight_exists_sql(alias: str = "j") -> str:
    """True when another non-stale job already holds this mission *lane*.

    A running reel must not block a still claim (and the reverse).
    """
    reel_j = _reel_job_sql(alias)
    reel_live = _reel_job_sql("live")
    return f"""
    EXISTS (
        SELECT 1 FROM production_jobs live
        WHERE live.mission_id = {alias}.mission_id
          AND live.status IN ('claimed', 'running')
          AND live.claimed_at >= now() - make_interval(secs => :stale_sec)
          AND (
            (({reel_j}) AND ({reel_live}))
            OR (NOT ({reel_j}) AND NOT ({reel_live}))
          )
    )
    """


async def has_live_in_flight(
    mission_id: uuid.UUID,
    *,
    stale_sec: int = _STALE_CLAIM_SEC,
    lane: str = "any",
) -> bool:
    """A worker is already painting this mission lane.

    ``lane='both'`` is true only when still *and* reel are in flight.
    """
    reel = _reel_job_sql("live")
    factory = _get_session_factory()
    async with factory() as db:
        if lane == "both":
            res = await db.execute(
                text(
                    f"""
                    SELECT
                      bool_or(NOT ({reel})) AS still_live,
                      bool_or({reel}) AS video_live
                    FROM production_jobs live
                    WHERE live.mission_id = CAST(:mission_id AS UUID)
                      AND live.status IN ('claimed', 'running')
                      AND live.claimed_at >= now() - make_interval(secs => :stale_sec)
                    """
                ),
                {"mission_id": str(mission_id), "stale_sec": int(stale_sec)},
            )
            row = res.first()
            return bool(row and row[0] and row[1])
        extra = ""
        if lane == "still":
            extra = f"AND NOT ({reel})"
        elif lane == "video":
            extra = f"AND ({reel})"
        res = await db.execute(
            text(
                f"""
                SELECT 1 FROM production_jobs live
                WHERE live.mission_id = CAST(:mission_id AS UUID)
                  AND live.status IN ('claimed', 'running')
                  AND live.claimed_at >= now() - make_interval(secs => :stale_sec)
                  {extra}
                LIMIT 1
                """
            ),
            {"mission_id": str(mission_id), "stale_sec": int(stale_sec)},
        )
        return res.first() is not None


async def claim_batch(
    mission_id: uuid.UUID | None,
    *,
    limit: int = 2,
    stale_sec: int = _STALE_CLAIM_SEC,
) -> list[dict[str, Any]]:
    """Atomically claim up to ``limit`` runnable jobs (FOR UPDATE SKIP LOCKED).

    A job is runnable when it is pending/failed and ``run_after <= now()``, OR it was
    claimed/running but its worker went stale. Marks claimed rows and returns them.
    One live produce per *lane*: stills (post/story/carousel) ignore a running
    reel so the weekly swipe does not wait on fal.ai. A batch never mixes lanes.
    Stills are claimed first when both are free. When reel production is paused
    (no fal wallet), reels are never claimed.
    """
    pause_reels = reel_production_paused()
    want_reel_sql = (
        "0"
        if pause_reels
        else f"""CASE
                      WHEN EXISTS (
                        SELECT 1 FROM production_jobs s
                        WHERE (CAST(:mission_id AS UUID) IS NULL
                               OR s.mission_id = CAST(:mission_id AS UUID))
                          AND (
                            (s.status IN ('pending', 'failed') AND s.run_after <= now())
                            OR (s.status IN ('claimed', 'running')
                                AND s.claimed_at < now() - make_interval(secs => :stale_sec))
                          )
                          AND NOT ({_terminal_error_sql("s.last_error")})
                          AND NOT ({_reel_job_sql("s")})
                          AND NOT ({_live_inflight_exists_sql("s")})
                          AND {_attempts_under_cap_sql("s")}
                      ) THEN 0 ELSE 1
                    END"""
    )
    reel_claim_sql = (
        f"AND NOT ({_reel_job_sql('j')})"
        if pause_reels
        else f"""AND (
                        (lane.want_reel = 0 AND NOT ({_reel_job_sql("j")}))
                        OR (lane.want_reel = 1 AND ({_reel_job_sql("j")}))
                      )"""
    )
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                WITH lane AS (
                    SELECT {want_reel_sql} AS want_reel
                ),
                claimable AS (
                    SELECT j.id FROM production_jobs j, lane
                    WHERE (CAST(:mission_id AS UUID) IS NULL
                           OR j.mission_id = CAST(:mission_id AS UUID))
                      AND (
                        (j.status IN ('pending', 'failed') AND j.run_after <= now())
                        OR (j.status IN ('claimed', 'running')
                            AND j.claimed_at < now() - make_interval(secs => :stale_sec))
                      )
                      AND NOT ({_terminal_error_sql("j.last_error")})
                      AND NOT ({_live_inflight_exists_sql("j")})
                      AND {_attempts_under_cap_sql("j")}
                      AND {_video_lane_cooldown_sql()}
                      {reel_claim_sql}
                    ORDER BY COALESCE(j.priority, 0) DESC, j.run_after ASC
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


async def merge_job_payload(
    job_id: str | uuid.UUID,
    patch: dict[str, Any] | None,
) -> None:
    """Shallow-merge JSON onto production_jobs.payload. Keeps catalogSlotLabel."""
    if not patch:
        return
    factory = _get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE production_jobs
                SET payload = COALESCE(payload, '{}'::jsonb) || CAST(:patch AS jsonb),
                    updated_at = now()
                WHERE id = CAST(:id AS UUID)
                """
            ),
            {"id": str(job_id), "patch": json.dumps(patch, ensure_ascii=False)},
        )
        await db.commit()


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
    max_age_sec: float | None = None,
    count_attempt: bool = False,
) -> str:
    """Re-queue without burning an attempt — e.g. auto-produce 409 production lock.

    Returns the resulting status ('pending', or 'exhausted' when the job hit a
    bound). Every defer costs a full pipeline re-run (LLM caption + gallery judge),
    so a defer that depends on the slot's own inputs must be bounded twice over:

    * ``count_attempt`` burns an attempt and escalates the retry delay
      exponentially. An age bound alone is not enough — at a flat 60 s cadence a
      job burns ~60 worker runs per hour, so a 6 h bound still costs ~360 runs.
    * ``max_age_sec`` is the wall-clock backstop for reasons that legitimately
      defer without burning attempts (external provider circuits).
    """
    factory = _get_session_factory()
    row_dict: dict[str, Any] | None = None
    # -1 disables the bound; keeps the interval argument numeric for asyncpg.
    bound_sec = float(max_age_sec) if max_age_sec and max_age_sec > 0 else -1.0
    base_delay = max(5.0, float(delay_sec))
    async with factory() as db:
        res = await db.execute(
            text(
                """
                WITH target AS (
                    SELECT id,
                           (:bound_sec >= 0
                            AND created_at < now() - make_interval(secs => :bound_sec))
                           AS expired,
                           (:count_attempt AND attempts + 1 >= max_attempts)
                           AS spent
                    FROM production_jobs
                    WHERE id = CAST(:id AS UUID)
                )
                UPDATE production_jobs p
                SET status = CASE
                        WHEN t.expired OR t.spent THEN 'exhausted'
                        ELSE 'pending' END,
                    attempts = CASE
                        WHEN t.expired OR :count_attempt THEN p.attempts + 1
                        ELSE p.attempts END,
                    completed_at = CASE
                        WHEN t.expired OR t.spent THEN now()
                        ELSE p.completed_at END,
                    last_error = :error,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    run_after = now() + make_interval(secs => CASE
                        WHEN :count_attempt
                            THEN LEAST(:cap, :delay_sec * power(2, p.attempts))
                        ELSE :delay_sec END),
                    updated_at = now()
                FROM target t
                WHERE p.id = t.id
                RETURNING p.*
                """
            ),
            {
                "id": str(job_id),
                "error": (reason or "")[:1000],
                "delay_sec": base_delay,
                "bound_sec": bound_sec,
                "count_attempt": bool(count_attempt),
                "cap": _BACKOFF_CAP_SEC,
            },
        )
        row = res.first()
        if row is not None:
            row_dict = _row_to_dict(row)
        await db.commit()
    status = str(row_dict["status"]) if row_dict else "pending"
    if row_dict:
        from app.services.production_line_telemetry_service import emit_from_job_row

        expired = status == "exhausted"
        await emit_from_job_row(
            row_dict,
            "exhausted" if expired else "deferred",
            status=status,
            error_code=None if expired else "deferred",
            error_message=reason,
            meta={
                "delay_sec": base_delay,
                **({"defer_attempt": row_dict.get("attempts")} if count_attempt else {}),
                **({"defer_bound_sec": bound_sec} if expired else {}),
            },
        )
        if expired:
            logger.warning(
                "production_job.defer_bound_exceeded",
                job_id=str(job_id),
                reason=(reason or "")[:120],
                bound_sec=bound_sec,
                attempts=row_dict.get("attempts"),
                counted_attempt=bool(count_attempt),
            )
    return status


async def mark_failed(
    job_id: str | uuid.UUID,
    error: str,
    *,
    retryable: bool = True,
    delay_sec: float | None = None,
    reset_priority: bool = False,
    attempt_cap: int | None = None,
) -> str:
    """Increment attempts and schedule a backoff retry, or mark exhausted.

    Returns the resulting status ('failed' or 'exhausted').
    """
    factory = _get_session_factory()
    row_dict: dict[str, Any] | None = None
    base = float(delay_sec) if delay_sec and delay_sec > 0 else float(_BACKOFF_BASE_SEC)
    effective_cap = max(1, int(attempt_cap or resolve_failure_attempt_cap(error)))
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
                    priority = CASE WHEN :reset_priority THEN 0 ELSE priority END,
                    max_attempts = LEAST(COALESCE(max_attempts, :hard_cap), :attempt_cap),
                    status = CASE
                        WHEN NOT :retryable THEN 'exhausted'
                        WHEN attempts + 1 >= LEAST(COALESCE(max_attempts, :hard_cap), :attempt_cap)
                            THEN 'exhausted'
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
                "reset_priority": bool(reset_priority),
                "base": base,
                "cap": _BACKOFF_CAP_SEC,
                "hard_cap": HARD_SLOT_ATTEMPT_CAP,
                "attempt_cap": effective_cap,
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


async def exhaust_open_terminal_error_jobs(*, limit: int = 80) -> int:
    """Stop leftover pending/failed/running rows whose error cannot succeed on retry."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                UPDATE production_jobs
                SET status = 'exhausted',
                    completed_at = COALESCE(completed_at, now()),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    last_error = left(
                        CASE
                            WHEN COALESCE(last_error, '') ILIKE '%ops-terminated%' THEN last_error
                            ELSE COALESCE(last_error, 'terminal produce error')
                                 || ' [ops-terminated: terminal produce error]'
                        END,
                        1000
                    ),
                    updated_at = now()
                WHERE status IN ('pending', 'failed', 'claimed', 'running')
                  AND ({_terminal_error_sql()})
                RETURNING id
                """
            ),
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info("production_jobs.exhaust_terminal_errors", exhausted=len(rows))
    return len(rows)


async def skip_open_reel_jobs(
    mission_id: uuid.UUID | None = None,
    *,
    reason: str = REEL_PAUSE_SKIP_REASON,
) -> int:
    """Mark open reel rows skipped so they do not sit in the weekly lot.

    Ready artifacts are untouched (status is already terminal).
    """
    if not reel_production_paused():
        return 0
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                UPDATE production_jobs j
                SET status = 'skipped',
                    last_error = :reason,
                    completed_at = now(),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    updated_at = now()
                WHERE j.status IN ('pending', 'failed', 'claimed', 'running')
                  AND ({_reel_job_sql("j")})
                  AND (CAST(:mission_id AS UUID) IS NULL
                       OR j.mission_id = CAST(:mission_id AS UUID))
                RETURNING j.id
                """
            ),
            {
                "reason": (reason or REEL_PAUSE_SKIP_REASON)[:500],
                "mission_id": str(mission_id) if mission_id else None,
            },
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.skip_open_reels",
            skipped=len(rows),
            mission_id=str(mission_id) if mission_id else None,
        )
    return len(rows)


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


async def reclaim_silent_inflight(
    mission_id: uuid.UUID | None = None,
    *,
    silent_sec: int = _SILENT_POST_INFLIGHT_SEC,
    limit: int = 50,
) -> int:
    """Pending a post that stayed running with no produce event.

    Deploy recycles the worker mid-fetch; callback never arrives; the row
    locks the mission for 15 min (``has_live_in_flight``). Reels stay on
    the long stale window.
    """
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE production_jobs j
                SET status = 'pending',
                    claimed_at = NULL,
                    claimed_by = NULL,
                    run_after = now(),
                    last_error = 'fetch failed [silent-inflight]',
                    updated_at = now()
                WHERE j.status IN ('claimed', 'running')
                  AND j.slot_key NOT ILIKE '%reel%'
                  AND j.claimed_at < now() - make_interval(secs => :silent_sec)
                  AND (
                    CAST(:mission_id AS UUID) IS NULL
                    OR j.mission_id = CAST(:mission_id AS UUID)
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM production_slot_events e
                    WHERE e.job_id = j.id
                      AND e.recorded_at >= j.claimed_at - interval '2 seconds'
                      AND e.event_type NOT IN ('claimed', 'running')
                  )
                RETURNING j.id
                """
            ),
            {
                "mission_id": str(mission_id) if mission_id else None,
                "silent_sec": int(silent_sec),
            },
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info(
            "production_jobs.reclaim_silent_inflight",
            mission_id=str(mission_id) if mission_id else None,
            reclaimed=len(rows),
        )
    return len(rows)


async def reclaim_inflight_jobs(mission_id: uuid.UUID) -> int:
    """Operator kick: recycle stale in-flight only.

    A live GPT / fal paint stays claimed. Cutting every running row on kick
    re-enqueued the same favorite 4 times and left zombie ``running`` rows.
    Worker-down slots still return after the BullMQ stale window (15 min).
    """
    from app.config import get_settings

    settings = get_settings()
    stale_sec = (
        _BULLMQ_WATCHDOG_STALE_SEC
        if settings.use_bullmq_executor
        else _FACTORY_DRAIN_STALE_RECLAIM_SEC
    )
    n = await reclaim_stale_jobs(mission_id, stale_sec=stale_sec)
    if n:
        logger.info(
            "production_jobs.reclaim_inflight",
            mission_id=str(mission_id),
            reclaimed=n,
            stale_sec=stale_sec,
        )
    return n


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


async def has_runnable_jobs(
    mission_id: uuid.UUID,
    *,
    lane: str | None = None,
) -> bool:
    """True if claim_batch would pick a row now.

    Pending/failed with ``run_after`` in the future (billing / lock defer) are
    open but not runnable — kicking drain on those burns workers and drops
    ready/claimed ratio. ``lane`` limits to still or video.
    """
    from app.config import get_settings

    settings = get_settings()
    stale_sec = (
        _BULLMQ_WATCHDOG_STALE_SEC
        if settings.use_bullmq_executor
        else _STALE_CLAIM_SEC
    )
    extra = ""
    if reel_production_paused():
        extra = "AND FALSE" if lane == "video" else f"AND NOT ({_reel_job_sql('j')})"
    elif lane == "still":
        extra = f"AND NOT ({_reel_job_sql('j')})"
    elif lane == "video":
        extra = f"AND ({_reel_job_sql('j')})"
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                f"""
                SELECT 1 FROM production_jobs j
                WHERE j.mission_id = CAST(:mission_id AS UUID)
                  AND (
                    (j.status IN ('pending', 'failed') AND j.run_after <= now())
                    OR (j.status IN ('claimed', 'running')
                        AND j.claimed_at < now() - make_interval(secs => :stale_sec))
                  )
                  AND NOT ({_live_inflight_exists_sql("j")})
                  AND {_attempts_under_cap_sql("j")}
                  {extra}
                LIMIT 1
                """
            ),
            {"mission_id": str(mission_id), "stale_sec": int(stale_sec)},
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
    attempts_ceiling: int = HARD_SLOT_ATTEMPT_CAP,
    include_gallery_theme_retry: bool = False,
    include_billing_retry: bool = False,
) -> int:
    """Guaranteed-fill: give exhausted slots more retries (bounded) so the drainer
    can fill them (e.g. after the reel Remotion fallback is in place). Returns count
    of rows requeued. The attempts ceiling prevents infinite retry loops."""
    # Permanent failures: do not auto-requeue (needs new gallery or templates).
    # Billing/quota: skipped unless include_billing_retry (operator kick / circuit clear).
    # Coherence-gate exhaustion already spent its bounded retries against the same
    # inputs; requeuing raises max_attempts and restarts the same loop at full cost.
    permanent_filter = """
                  AND COALESCE(last_error, '') NOT ILIKE '%library_template_required%'
                  AND COALESCE(last_error, '') NOT ILIKE '%library_template_replica_required%'
                  AND COALESCE(last_error, '') NOT ILIKE '%tutarsız%'
                  AND COALESCE(last_error, '') NOT ILIKE '%caption_design_incoherent%'
                  AND COALESCE(last_error, '') NOT ILIKE '%ops-terminated%'
                  AND COALESCE(last_error, '') NOT ILIKE '%paket yok%'
                  AND COALESCE(last_error, '') NOT ILIKE '%paket yarım%'
                  AND COALESCE(last_error, '') NOT ILIKE '%incomplete_pack%'
                  AND COALESCE(last_error, '') NOT ILIKE '%galeri eşleşmesi yok%'
                  AND COALESCE(last_error, '') NOT ILIKE '%galeri–caption eşleşmesi%'
                  AND COALESCE(last_error, '') NOT ILIKE '%galeri-caption eşleşmesi%'
                  AND COALESCE(last_error, '') NOT ILIKE '%uyumlu marka fotoğrafı bulunamadı%'
                  AND COALESCE(last_error, '') NOT ILIKE '%hero reel slot assigned%'
                  AND COALESCE(last_error, '') NOT ILIKE '%bakış yapılamadı%'
    """
    if not include_billing_retry:
        permanent_filter += """
                  AND COALESCE(last_error, '') NOT ILIKE '%skip-no-fal-quota%'
                  AND COALESCE(last_error, '') NOT ILIKE '%provider_billing_circuit_open%'
                  AND COALESCE(last_error, '') NOT ILIKE '%balance exhausted%'
                  AND COALESCE(last_error, '') NOT ILIKE '%exhausted balance%'
                  AND COALESCE(last_error, '') NOT ILIKE '%insufficient_quota%'
                  AND COALESCE(last_error, '') NOT ILIKE '%no credits remaining%'
                  AND COALESCE(last_error, '') NOT ILIKE '%user is locked%'
        """
    if not include_gallery_theme_retry:
        permanent_filter += """
                  AND COALESCE(last_error, '') NOT ILIKE '%tema çatışması%'
                  AND COALESCE(last_error, '') NOT ILIKE '%gallery_theme_mismatch%'
                  AND COALESCE(last_error, '') NOT ILIKE '%gallery_volume_shortfall%'
                  AND COALESCE(last_error, '') NOT ILIKE '%yeni çekim yükleyin%'
        """
    attempts_filter = ""
    if not include_gallery_theme_retry and not include_billing_retry:
        attempts_filter = "AND attempts < :ceiling"
    requeue_suffix = (
        " [gallery-retry]" if include_gallery_theme_retry
        else (" [billing-retry]" if include_billing_retry else " [requeued]")
    )
    ceiling = min(int(attempts_ceiling), HARD_SLOT_ATTEMPT_CAP)
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
                    max_attempts = LEAST(
                        GREATEST(COALESCE(max_attempts, :ceiling), 1),
                        :ceiling
                    ),
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
                "ceiling": ceiling,
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
                    max_attempts = LEAST(
                        GREATEST(COALESCE(max_attempts, :cap), 1),
                        :cap
                    ),
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
                "cap": HARD_SLOT_ATTEMPT_CAP,
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
                  AND (
                    {_attempts_under_cap_sql("")}
                    OR :billing_retry
                  )
                  AND COALESCE(last_error, '') NOT ILIKE '%tema çatışması%'
                  AND COALESCE(last_error, '') NOT ILIKE '%gallery_theme_mismatch%'
                  AND COALESCE(last_error, '') NOT ILIKE '%library_template_required%'
                  AND COALESCE(last_error, '') NOT ILIKE '%library_template_replica_required%'
                  AND COALESCE(last_error, '') NOT ILIKE '%paket yok%'
                  AND COALESCE(last_error, '') NOT ILIKE '%paket yarım%'
                  AND COALESCE(last_error, '') NOT ILIKE '%incomplete_pack%'
                  AND COALESCE(last_error, '') NOT ILIKE '%galeri eşleşmesi yok%'
                  AND COALESCE(last_error, '') NOT ILIKE '%galeri–caption eşleşmesi%'
                  AND COALESCE(last_error, '') NOT ILIKE '%galeri-caption eşleşmesi%'
                  AND COALESCE(last_error, '') NOT ILIKE '%uyumlu marka fotoğrafı bulunamadı%'
                  AND COALESCE(last_error, '') NOT ILIKE '%hero reel slot assigned%'
                  AND COALESCE(last_error, '') NOT ILIKE '%bakış yapılamadı%'
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
                f"""
                SELECT DISTINCT mission_id FROM production_jobs
                WHERE (
                    (
                    status IN ('pending', 'failed')
                    AND run_after <= now()
                    AND {_attempts_under_cap_sql("")}
                  )
                   OR (status IN ('claimed', 'running')
                       AND claimed_at < now() - make_interval(secs => :stale_sec))
                    )
                  AND {workspace_lane_cooldown_sql("workspace_id")}
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
                f"""
                WITH runnable AS (
                    SELECT mission_id, workspace_id,
                           MIN(COALESCE(run_after, updated_at)) AS oldest_wait,
                           MAX(COALESCE(priority, 0)) AS max_priority
                    FROM production_jobs
                    WHERE (
                        (
                        status IN ('pending', 'failed')
                        AND run_after <= now()
                        AND {_attempts_under_cap_sql("")}
                    ) OR (
                        status IN ('claimed', 'running')
                        AND claimed_at < now() - make_interval(secs => :stale_sec)
                    )
                    )
                      AND {workspace_lane_cooldown_sql("workspace_id")}
                    GROUP BY mission_id, workspace_id
                ),
                ranked AS (
                    SELECT mission_id, workspace_id, oldest_wait, max_priority,
                           ROW_NUMBER() OVER (
                               PARTITION BY workspace_id
                               ORDER BY oldest_wait ASC, max_priority DESC
                           ) AS ws_rank
                    FROM runnable
                )
                SELECT mission_id::text
                FROM ranked
                WHERE ws_rank = 1
                ORDER BY oldest_wait ASC, max_priority DESC
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
