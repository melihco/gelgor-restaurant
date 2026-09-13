"""Characterization tests for the durable production factory drain path.

These lock in the *current* behavior of ``production_factory_service`` so the
upcoming ProductionBridge refactor (extracting the Next.js HTTP trigger behind a
clean interface) can be verified to preserve semantics.

No live DB or network: the ``jobs`` repository, the Next.js trigger, and the
mission-state finalizer are monkeypatched.
"""

from __future__ import annotations

import uuid

import pytest

from app.services import production_factory_service as pfs

# Import the production modules at collection time (real settings) so the shared
# async engine in ``app.database`` is created before ``patch_settings`` installs a
# stub — keeps this file green when run in isolation, not just in the full suite.
from app.services import production_trigger as _production_trigger  # noqa: F401

# ── Pure outcome helpers ─────────────────────────────────────────────────────


def test_slot_succeeded_counts_rendering_or_publishready_not_produced() -> None:
    assert pfs._slot_succeeded({"produced": 1}) is False
    assert pfs._slot_succeeded({"rendering": 2}) is True
    assert pfs._slot_succeeded({"publishReady": 1}) is True
    assert pfs._slot_succeeded({"produced": 1, "publishReady": 0}) is False
    assert pfs._slot_succeeded({"produced": 0, "rendering": 0, "publishReady": 0}) is False
    assert pfs._slot_succeeded(None) is False
    assert pfs._slot_succeeded({}) is False


def test_artifact_id_from_returns_first_publish_ready_id() -> None:
    data = {
        "results": [
            {"error": "x"},
            {"id": "art-hidden", "publishReady": False},
            {"id": "art-ready", "publishReady": True},
        ]
    }
    assert pfs._artifact_id_from(data) == "art-ready"
    assert pfs._artifact_id_from({"results": [{"id": "art-1"}]}) is None
    assert pfs._artifact_id_from({"results": []}) is None
    assert pfs._artifact_id_from(None) is None


def test_succeeded_slot_map_keys_by_slotkey_skipping_errors_and_idless() -> None:
    data = {
        "results": [
            {"slotKey": "0:story", "id": "art-0", "publishReady": True},
            {"slotKey": "1:post", "error": "withheld"},  # skipped (error)
            {"slotKey": "2:reel"},  # skipped (no id)
            {"id": "art-3", "publishReady": True},  # skipped (no slotKey)
            {"slotKey": "3:carousel", "id": "art-3b", "publishReady": True},
            {"slotKey": "4:post", "id": "art-hidden", "publishReady": False},
        ]
    }
    assert pfs._succeeded_slot_map(data) == {"0:story": "art-0", "3:carousel": "art-3b"}
    assert pfs._succeeded_slot_map(None) == {}


def test_succeeded_slot_map_shop_and_beach_quality_block_not_ready() -> None:
    data = {
        "results": [
            {
                "slotKey": "0:fal_designed_post",
                "id": "art-shop",
                "publishReady": False,
                "errorCode": "quality_hard_block",
            },
            {
                "slotKey": "1:fal_designed_post",
                "id": "art-beach",
                "publishReady": True,
            },
            {
                "slotKey": "2:fal_designed_story",
                "error": "Tasarım kalitesi onay için yeterli değil",
                "errorCode": "quality_hard_block",
            },
        ]
    }
    assert pfs._succeeded_slot_map(data) == {"1:fal_designed_post": "art-beach"}
    assert pfs._slot_failure_map(data) == {
        "0:fal_designed_post": "quality_hard_block",
        "2:fal_designed_story": "Tasarım kalitesi onay için yeterli değil",
    }
    assert pfs._is_non_retryable_slot_failure(
        "Tasarım kalitesi onay için yeterli değil",
        produce_data=data,
        slot_key="2:fal_designed_story",
    ) is False
    assert pfs._is_non_retryable_slot_failure(
        "quality_hard_block",
        produce_data=data,
        slot_key="0:fal_designed_post",
    ) is False


def test_succeeded_slot_map_treats_duplicate_skipped_as_ready() -> None:
    data = {
        "results": [
            {"slotKey": "12:premium_editorial_campaign_story", "error": "duplicate_skipped"},
        ]
    }
    assert pfs._succeeded_slot_map(data) == {
        "12:premium_editorial_campaign_story": None,
    }


def test_fetch_failed_and_persist_url_are_classified() -> None:
    assert pfs._is_ops_defer_reason("fetch failed") is True
    assert pfs._is_non_retryable_slot_failure(
        "Production failed: no persistable content URL"
    ) is True


def test_slot_failure_map_extracts_per_slot_errors() -> None:
    data = {
        "results": [
            {"slotKey": "0:organic_post", "error": "Remotion 422: photo unreachable"},
            {"slotKey": "1:fal_only_post", "id": "art-1", "publishReady": True},
            {"slotKey": "2:designed_post", "error": "withheld_quality_gate"},
        ]
    }
    assert pfs._slot_failure_map(data) == {
        "0:organic_post": "Remotion 422: photo unreachable",
        "2:designed_post": "withheld_quality_gate",
    }


def test_resolve_slot_failure_reason_prefers_per_slot_error() -> None:
    produce = {
        "results": [{"slotKey": "0:organic_post", "error": "Galeri mirror failed"}],
        "withheld": 1,
        "produced": 0,
    }
    assert pfs._resolve_slot_failure_reason(produce, "0:organic_post", "no_artifact") == "Galeri mirror failed"
    assert pfs._resolve_slot_failure_reason(produce, "9:other", "no_artifact") == "withheld_quality_gate"
    assert pfs._resolve_slot_failure_reason(produce, "9:other", "production_in_flight") == "production_in_flight"


def test_is_non_retryable_slot_failure_detects_gallery_theme_mismatch() -> None:
    produce = {
        "results": [
            {
                "slotKey": "5:campaign_story_motion",
                "error": 'Caption–görsel tema çatışması — "Zeytinyağı" için uygun galeri fotoğrafı yok',
                "errorCode": "gallery_theme_mismatch",
            },
        ],
    }
    assert pfs._is_non_retryable_slot_failure(
        "Caption–görsel tema çatışması",
        produce_data=produce,
        slot_key="5:campaign_story_motion",
    ) is True
    assert pfs._is_non_retryable_slot_failure(
        "withheld_quality_gate",
        produce_data=produce,
        slot_key="5:campaign_story_motion",
    ) is False
    assert pfs._is_non_retryable_slot_failure("Remotion 422: photo unreachable") is False


def test_is_non_retryable_slot_failure_detects_gallery_volume_shortfall() -> None:
    produce = {
        "results": [
            {
                "slotKey": "3:organic_story_still",
                "error": "Galeride yeterli farklı marka fotoğrafı yok — bu slot için yeni çekim yükleyin",
                "errorCode": "gallery_volume_shortfall",
            },
        ],
    }
    assert pfs._is_non_retryable_slot_failure(
        "Galeride yeterli farklı marka fotoğrafı yok — bu slot için yeni çekim yükleyin",
        produce_data=produce,
        slot_key="3:organic_story_still",
    ) is True
    assert pfs._job_gallery_volume_withheld({
        "payload": {"galleryVolumeWithheld": True, "withholdReason": "gallery_volume_shortfall"},
    }) is True
    assert pfs._job_gallery_volume_withheld({
        "payload": {"galleryPhotoUrl": "https://cdn.example.com/p.jpg"},
    }) is False


def test_resolve_bullmq_batch_reason_unreachable_not_in_flight() -> None:
    assert pfs._resolve_bullmq_batch_reason(None, http_status=0) == "auto_produce_unreachable"
    assert pfs._resolve_bullmq_batch_reason(
        {"error": "fetch failed"}, http_status=0,
    ) == "fetch failed"
    assert pfs._resolve_bullmq_batch_reason(None, http_status=409) == "production_in_flight"


def test_bullmq_stale_window_does_not_overlap_live_paint() -> None:
    from app.services import production_job_service as pjs

    assert pjs._BULLMQ_WATCHDOG_STALE_SEC == pjs._BULLMQ_DRAIN_STALE_RECLAIM_SEC
    assert pjs._BULLMQ_WATCHDOG_STALE_SEC >= 900


def test_silent_post_inflight_reclaim_is_shorter_than_reel_window() -> None:
    import inspect

    from app.services import production_job_service as pjs

    assert pjs._SILENT_POST_INFLIGHT_SEC == 600
    assert pjs._SILENT_POST_INFLIGHT_SEC < pjs._BULLMQ_WATCHDOG_STALE_SEC
    src = inspect.getsource(pjs.reclaim_silent_inflight)
    assert "production_slot_events" in src
    assert "NOT ILIKE '%reel%'" in src
    assert "silent-inflight" in src


def test_operator_kick_reclaim_is_stale_only() -> None:
    import inspect

    from app.services import production_job_service as pjs

    src = inspect.getsource(pjs.reclaim_inflight_jobs)
    assert "reclaim_stale_jobs" in src
    assert "AND status IN ('claimed', 'running')" not in src
    assert "stale_sec" in src


def test_ops_defer_reasons_are_worker_locks_not_empty_wallet() -> None:
    assert pfs._is_ops_defer_reason("production_in_flight") is True
    assert pfs._is_ops_defer_reason("production_worker_offline") is True
    assert pfs._is_ops_defer_reason("fetch failed") is True
    assert pfs._is_ops_defer_reason(
        "Caption–tasarım–görsel tutarsız (overlay_ungrounded)",
    ) is True
    assert pfs._is_ops_defer_reason(
        "library template replica: grounded gallery design failed — synthetic Ideogram fallback disabled",
    ) is True
    assert pfs._is_ops_defer_reason("withheld_quality_gate") is False
    assert pfs._is_ops_defer_reason("no_artifact") is False
    assert pfs._is_ops_defer_reason("provider_billing_circuit_open [skip-no-fal-quota]") is True
    assert pfs._is_ops_defer_reason("provider_billing_circuit_open") is True
    assert pfs._bullmq_defer_delay_sec("provider_billing_circuit_open") == 1800.0
    assert pfs._resolve_bullmq_batch_reason(
        {"error": "provider_billing_circuit_open"},
        http_status=402,
    ) == "provider_billing_circuit_open"
    assert pfs._is_ops_defer_reason("budget_exhausted") is False
    assert pfs._is_ops_defer_reason(
        "Aylık kredi limiti doldu (25,689 / 25,000 SA Kredi)",
    ) is False
    assert pfs._bullmq_defer_delay_sec("Caption–tasarım–görsel tutarsız (overlay_ungrounded)") == 60.0
    assert pfs._resolve_bullmq_batch_reason(
        {"error": "Aylık kredi limiti doldu (1 / 1 SA Kredi)"},
        http_status=429,
    ).startswith("Aylık kredi")


def test_empty_wallet_and_missing_pack_are_terminal() -> None:
    from app.services.production_job_service import (
        _terminal_error_sql,
        is_terminal_produce_error,
    )

    shop_look_call = "Bakış yapılamadı (bakış çağrısı)"
    shop_pack = "Paket yok (Aday fotoğraflar bu işi kanıtlamıyor)"
    beach_pack = "Paket yok"
    beach_billing = (
        'fal_only_video: All typography models failed. Ideogram: Ideogram enqueue '
        'failed 403: {"detail":"User is locked. Reason: Exhausted balance."}'
    )
    shop_credits = (
        "429 You have no credits remaining. Add credits to continue using the API"
    )
    assert is_terminal_produce_error(shop_look_call) is False
    look_sql = _terminal_error_sql("last_error")
    assert "bakış çağrısı" in look_sql.lower()
    assert "not ilike" in look_sql.lower()
    assert is_terminal_produce_error(shop_pack) is True
    assert is_terminal_produce_error(beach_pack) is True
    shop_gallery = "Galeri eşleşmesi yok — caption ile uyumlu marka fotoğrafı bulunamadı"
    beach_gallery = (
        "Galeri–caption eşleşmesi yetersiz (0/55) — "
        "\"Bodrum'da eşsiz gün batımı\" için uygun galeri fotoğrafı yok"
    )
    assert is_terminal_produce_error(shop_gallery) is True
    assert is_terminal_produce_error(beach_gallery) is True
    assert pfs._is_non_retryable_slot_failure(shop_gallery) is True
    assert pfs._is_non_retryable_slot_failure(beach_gallery) is True
    assert is_terminal_produce_error(
        "Hero reel slot assigned to another idea — publish as story"
    ) is True
    assert is_terminal_produce_error(beach_billing) is True
    assert is_terminal_produce_error(shop_credits) is True
    shop_shell = (
        "library_template_replica_required: saved shell preview missing for Ürün hero"
    )
    beach_shell = (
        "library_template_replica_required: saved shell preview missing for Gün batımı"
    )
    assert is_terminal_produce_error(shop_shell) is True
    assert is_terminal_produce_error(beach_shell) is True
    assert pfs._is_non_retryable_slot_failure(shop_shell) is True
    assert pfs._is_non_retryable_slot_failure(beach_shell) is True
    assert pfs._is_ops_defer_reason(shop_shell) is False
    assert pfs._is_non_retryable_slot_failure(shop_look_call) is False
    assert pfs._is_non_retryable_slot_failure(shop_pack) is True
    assert pfs._is_non_retryable_slot_failure(beach_pack) is True
    assert pfs._is_non_retryable_slot_failure(beach_billing) is True
    assert pfs._is_non_retryable_slot_failure(shop_credits) is True
    assert pfs._is_ops_defer_reason(shop_pack) is False
    assert pfs._is_ops_defer_reason(beach_billing) is False
    shop_circuit = "provider_billing_circuit_open: OpenAI kotası doldu"
    beach_circuit = "provider_billing_circuit_open [skip-no-fal-quota]"
    assert is_terminal_produce_error(shop_circuit) is False
    assert is_terminal_produce_error(beach_circuit) is False
    assert pfs._is_ops_defer_reason(shop_circuit) is True
    assert pfs._is_ops_defer_reason(beach_circuit) is True
    shop_type = "Görseldeki metin doğrulanamadı veya yarım kaldı"
    beach_type = "Görseldeki metin doğrulanamadı veya yarım kaldı"
    assert is_terminal_produce_error(shop_type) is True
    assert is_terminal_produce_error(beach_type) is True
    assert pfs._is_non_retryable_slot_failure(shop_type) is True
    assert pfs._is_non_retryable_slot_failure(beach_type) is True


def test_lane_blockers_shop_and_beach_do_not_hog_the_paint_lane() -> None:
    from app.services.production_job_service import (
        HARD_SLOT_ATTEMPT_CAP,
        LOOK_OPS_ATTEMPT_CAP,
        is_lane_blocker_look_ops,
        is_lane_blocker_provider,
        is_terminal_produce_error,
        resolve_failure_attempt_cap,
        workspace_lane_cooldown_sql,
    )

    shop_look = "Bakış yapılamadı (bakış çağrısı)"
    beach_look = "Bakış yapılamadı (fotoğraf açılamadı)"
    shop_pack = "Paket yok (Aday fotoğraflar bu işi kanıtlamıyor)"
    beach_gallery = "Galeri eşleşmesi yok — caption ile uyumlu marka fotoğrafı bulunamadı"
    shop_gpt = (
        "fal_design: library_template_replica_failed: "
        "gpt-image exhausted on purpose-pinned template"
    )
    beach_lock = (
        'fal_video_designer: All typography models failed. Ideogram: Ideogram enqueue '
        'failed 403: {"detail":"User is locked. Reason: Exhausted balance."}'
    )

    assert is_lane_blocker_look_ops(shop_look) is True
    assert is_lane_blocker_look_ops(beach_look) is True
    assert is_lane_blocker_look_ops(shop_pack) is False
    assert is_lane_blocker_look_ops(beach_gallery) is False
    assert is_terminal_produce_error(shop_pack) is True
    assert is_terminal_produce_error(beach_gallery) is True
    assert is_terminal_produce_error(shop_gpt) is True
    assert is_lane_blocker_provider(shop_gpt) is True
    assert is_lane_blocker_provider(beach_lock) is True
    assert is_lane_blocker_look_ops(shop_gpt) is False
    assert pfs._is_non_retryable_slot_failure(shop_gpt) is True
    assert pfs._is_non_retryable_slot_failure(shop_look) is False
    assert LOOK_OPS_ATTEMPT_CAP == 2
    assert LOOK_OPS_ATTEMPT_CAP < HARD_SLOT_ATTEMPT_CAP
    assert resolve_failure_attempt_cap(shop_look) == 2
    assert resolve_failure_attempt_cap(beach_look) == 2
    assert resolve_failure_attempt_cap(shop_pack) == HARD_SLOT_ATTEMPT_CAP
    assert resolve_failure_attempt_cap(beach_gallery) == HARD_SLOT_ATTEMPT_CAP
    assert pfs._lane_same_mission_delay_sec([shop_look], default=2.0) == 180
    assert pfs._lane_same_mission_delay_sec([beach_look], default=2.0) == 180
    assert pfs._lane_same_mission_delay_sec([shop_gpt], default=2.0) == 600
    assert pfs._lane_same_mission_delay_sec([shop_pack], default=2.0) == 2.0
    sql = workspace_lane_cooldown_sql()
    assert "bakış çağrısı" in sql
    assert "gpt-image exhausted" in sql
    assert "user is locked" in sql


def test_publish_code_map_shop_and_beach() -> None:
    from app.services.production_job_service import (
        is_retryable_publish_error,
        is_terminal_produce_error,
    )

    shop_quality = "Tasarım kalitesi onay için yeterli değil"
    beach_type = "Görseldeki metin doğrulanamadı veya yarım kaldı"
    shop_pack = "Paket yarım — vitrine düşmez"
    beach_pack = "incomplete_pack"
    shop_cohere = "Yazı, foto ve başlık aynı işi anlatmıyor"
    beach_reel = "Reel için video gerekli"

    assert is_retryable_publish_error(shop_quality) is True
    assert is_retryable_publish_error(beach_type) is False
    assert is_terminal_produce_error(beach_type) is True
    assert is_retryable_publish_error(shop_cohere) is True
    assert is_retryable_publish_error("quality_hard_block") is True
    assert is_terminal_produce_error(shop_quality) is False
    assert is_terminal_produce_error("quality_hard_block") is False
    assert is_terminal_produce_error("caption_design_incoherent") is False
    assert is_terminal_produce_error(shop_pack) is True
    assert is_terminal_produce_error(beach_pack) is True

    shop_hidden = {
        "results": [
            {
                "slotKey": "0:fal_designed_post",
                "error": shop_quality,
                "errorCode": "quality_hard_block",
            },
        ],
    }
    beach_hidden = {
        "results": [
            {
                "slotKey": "1:fal_designed_story",
                "error": beach_type,
                "errorCode": "quality_hard_block",
            },
        ],
    }
    shop_half = {
        "results": [
            {
                "slotKey": "2:fal_designed_post",
                "error": shop_pack,
                "errorCode": "incomplete_pack",
            },
        ],
    }
    beach_half = {
        "results": [
            {
                "slotKey": "3:fal_designed_story",
                "error": "Paket yarım — vitrine düşmez",
                "errorCode": "incomplete_pack",
            },
        ],
    }
    assert pfs._is_non_retryable_slot_failure(
        shop_quality, produce_data=shop_hidden, slot_key="0:fal_designed_post"
    ) is False
    assert pfs._is_non_retryable_slot_failure(
        beach_type, produce_data=beach_hidden, slot_key="1:fal_designed_story"
    ) is True
    assert pfs._is_non_retryable_slot_failure(
        shop_pack, produce_data=shop_half, slot_key="2:fal_designed_post"
    ) is True
    assert pfs._is_non_retryable_slot_failure(
        "Paket yarım — vitrine düşmez",
        produce_data=beach_half,
        slot_key="3:fal_designed_story",
    ) is True
    assert pfs._is_non_retryable_slot_failure(shop_cohere) is False
    assert pfs._is_non_retryable_slot_failure(beach_reel) is False
    assert pfs._is_ops_defer_reason("quality_hard_block") is False
    assert pfs._is_ops_defer_reason("caption_design_incoherent") is False
    assert pfs._is_ops_defer_reason(shop_pack) is False


def test_quality_defers_burn_attempts_and_ops_defers_are_age_capped() -> None:
    """A flat-delay defer that never burns an attempt loops ~60x/hour forever."""
    quality = "Caption–tasarım–görsel tutarsız (overlay_meaningless)"
    template = "library_template_required: no renderable template for catalog_slot_key=x"
    ops = "production_in_flight"

    # Quality gates re-run the same inputs — bound by attempts, not just wall clock.
    assert pfs._defer_counts_attempt(quality) is True
    assert pfs._defer_counts_attempt(template) is True
    shop_lock = "production_in_flight"
    beach_lock = "production_in_flight [route_still_running]"
    assert pfs._defer_counts_attempt(ops) is True
    assert pfs._defer_counts_attempt(shop_lock) is True
    assert pfs._defer_counts_attempt(beach_lock) is True
    assert pfs._is_inflight_defer_reason(shop_lock) is True
    assert pfs._bullmq_defer_delay_sec("production_in_flight") == 240.0
    assert pfs._bullmq_defer_delay_sec("route_still_running") == 240.0
    shop_timeout = {"code": "route_still_running"}
    beach_timeout = {"code": "route_still_running", "reason": "production_in_flight"}
    assert pfs._should_keep_running_for_inflight(shop_timeout, "production_in_flight") is True
    assert pfs._should_keep_running_for_inflight(beach_timeout, "production_in_flight") is True
    assert pfs._should_keep_running_for_inflight({}, "production_in_flight") is False

    assert pfs._defer_counts_attempt("fetch failed") is True
    assert pfs._defer_counts_attempt("auto_produce_unreachable") is True
    from app.services.production_job_service import (
        HARD_SLOT_ATTEMPT_CAP,
        _attempts_under_cap_sql,
    )

    assert HARD_SLOT_ATTEMPT_CAP == 3
    assert "LEAST" in _attempts_under_cap_sql("j")
    assert "3" in _attempts_under_cap_sql("j")
    # Both categories still get a wall-clock backstop; nothing defers forever.
    assert pfs._defer_max_age_sec(quality) == pfs._quality_defer_max_age_sec()
    assert pfs._defer_max_age_sec(ops) == pfs._ops_defer_max_age_sec()
    assert pfs._defer_max_age_sec("no_artifact") is None
    assert pfs._quality_defer_max_age_sec() < pfs._ops_defer_max_age_sec()
    assert pfs._defer_max_age_sec("provider_billing_circuit_open") == pfs._ops_defer_max_age_sec()


# ── Drain flow helpers ───────────────────────────────────────────────────────


def _job(idea_index: int, slot_role: str) -> dict:
    return {"id": uuid.uuid4(), "idea_index": idea_index, "slot_role": slot_role}


class _JobsRecorder:
    """Records job-repository calls and serves a scripted sequence of claims."""

    def __init__(self, claim_batches: list[list[dict]], summary: dict) -> None:
        self._claim_batches = list(claim_batches)
        self._summary = summary
        self.ready: list[tuple[uuid.UUID, str | None]] = []
        self.failed: list[tuple[uuid.UUID, str]] = []
        self.deferred: list[tuple[uuid.UUID, str]] = []
        self.defer_opts: list[dict] = []
        self.running: list[uuid.UUID] = []
        self.live_in_flight = False

    async def has_live_in_flight(
        self,
        mission_id: uuid.UUID,
        *,
        stale_sec: int = 900,
    ) -> bool:
        return self.live_in_flight

    async def has_open_jobs(self, mission_id: uuid.UUID) -> bool:
        return not self._summary.get("complete", False)

    async def has_runnable_jobs(self, mission_id: uuid.UUID) -> bool:
        return await self.has_open_jobs(mission_id)

    async def claim_batch(
        self,
        mission_id: uuid.UUID,
        *,
        limit: int,
        stale_sec: int = 1800,
    ) -> list[dict]:
        if self._claim_batches:
            return self._claim_batches.pop(0)
        return []

    async def mark_running(self, job_id: uuid.UUID) -> None:
        self.running.append(job_id)

    async def mark_ready(self, job_id: uuid.UUID, *, artifact_id: str | None = None) -> None:
        self.ready.append((job_id, artifact_id))

    async def mark_failed(self, job_id: uuid.UUID, reason: str, **kwargs) -> str:
        retryable = kwargs.get("retryable", True)
        self.failed.append((job_id, reason, retryable))
        return "exhausted" if retryable is False else "failed"

    async def mark_deferred(
        self,
        job_id: uuid.UUID,
        reason: str,
        *,
        delay_sec: float = 45.0,
        max_age_sec: float | None = None,
        count_attempt: bool = False,
    ) -> str:
        self.deferred.append((job_id, reason))
        self.defer_opts.append(
            {"delay_sec": delay_sec, "max_age_sec": max_age_sec, "count_attempt": count_attempt}
        )
        return "pending"

    async def mission_job_summary(self, mission_id: uuid.UUID) -> dict:
        return self._summary

    async def reclaim_stale_jobs(self, mission_id: uuid.UUID, *, stale_sec: int = 600) -> int:
        return 0


def _install_drain_doubles(
    monkeypatch: pytest.MonkeyPatch,
    *,
    jobs: _JobsRecorder,
    trigger_result: dict,
    brand,
    capture_trigger_kwargs: dict | None = None,
):
    """Wire up the monkeypatches shared by the drain flow tests."""
    for name in (
        "has_open_jobs",
        "has_runnable_jobs",
        "has_live_in_flight",
        "claim_batch",
        "mark_running",
        "mark_ready",
        "mark_failed",
        "mark_deferred",
        "mission_job_summary",
        "reclaim_stale_jobs",
    ):
        monkeypatch.setattr(pfs.jobs, name, getattr(jobs, name), raising=True)

    async def _fake_inputs(workspace_id, mission_id):
        return brand, "content_ideation", "summary-json", {"report": True}

    monkeypatch.setattr(pfs, "_load_drain_inputs", _fake_inputs, raising=True)

    async def _fake_finalize(mission_id):
        return jobs._summary

    monkeypatch.setattr(pfs, "_finalize_mission_production_state", _fake_finalize, raising=True)

    rekicks: list = []
    monkeypatch.setattr(
        pfs,
        "schedule_drain",
        lambda *a, **k: rekicks.append((a, k)),
        raising=True,
    )
    monkeypatch.setattr(
        pfs,
        "schedule_completion_pass",
        lambda *a, **k: None,
        raising=True,
    )

    async def _fake_trigger(**kwargs):
        if capture_trigger_kwargs is not None:
            capture_trigger_kwargs.update(kwargs)
        return trigger_result

    # Patch the trigger on its implementation module (moved out of the executor
    # in b1b). The bridge → production_trigger path resolves it lazily.
    monkeypatch.setattr(
        "app.services.production_trigger.trigger_auto_produce",
        _fake_trigger,
        raising=True,
    )
    return rekicks


async def test_drain_inline_marks_ready_and_failed_by_slotkey(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=False)
    batch = [_job(0, "story"), _job(1, "post")]
    jobs = _JobsRecorder(
        claim_batches=[batch],
        summary={"total": 2, "complete": False, "active": 0, "failed": 1, "ready": 1},
    )
    # Only the story slot produced a persisted artifact; the post slot was withheld.
    trigger_result = {
        "results": [
            {"slotKey": "0:story", "id": "art-story", "publishReady": True},
            {"slotKey": "1:post", "error": "withheld"},
        ]
    }
    _install_drain_doubles(
        monkeypatch, jobs=jobs, trigger_result=trigger_result, brand=brand_stub
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["claimed"] == 2
    assert out["ready"] == 1
    assert out["failed"] == 1
    assert out["enqueued"] == 0
    assert jobs.running == [batch[0]["id"], batch[1]["id"]]
    assert jobs.ready == [(batch[0]["id"], "art-story")]
    assert [jid for jid, _, _ in jobs.failed] == [batch[1]["id"]]


async def test_drain_shop_and_beach_quality_hard_block_failed_not_ready(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=False)
    shop = _job(0, "fal_designed_post")
    beach = _job(1, "fal_designed_story")
    jobs = _JobsRecorder(
        claim_batches=[[shop, beach]],
        summary={"total": 2, "complete": False, "active": 0, "failed": 2, "ready": 0},
    )
    trigger_result = {
        "results": [
            {
                "slotKey": "0:fal_designed_post",
                "id": "art-shop-hidden",
                "publishReady": False,
                "errorCode": "quality_hard_block",
            },
            {
                "slotKey": "1:fal_designed_story",
                "error": "Tasarım kalitesi onay için yeterli değil",
                "errorCode": "quality_hard_block",
            },
        ],
    }
    _install_drain_doubles(
        monkeypatch, jobs=jobs, trigger_result=trigger_result, brand=brand_stub
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["ready"] == 0
    assert out["failed"] == 2
    assert jobs.ready == []
    assert [retryable for _, _, retryable in jobs.failed] == [True, True]
    assert jobs.failed[0][1] == "quality_hard_block"
    assert jobs.failed[1][1] == "Tasarım kalitesi onay için yeterli değil"


async def test_drain_shop_and_beach_incomplete_pack_exhausted(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=False)
    shop = _job(0, "fal_designed_post")
    beach = _job(1, "fal_designed_story")
    jobs = _JobsRecorder(
        claim_batches=[[shop, beach]],
        summary={"total": 2, "complete": False, "active": 0, "failed": 2, "ready": 0},
    )
    trigger_result = {
        "results": [
            {
                "slotKey": "0:fal_designed_post",
                "error": "Paket yarım — vitrine düşmez",
                "errorCode": "incomplete_pack",
            },
            {
                "slotKey": "1:fal_designed_story",
                "error": "incomplete_pack",
                "errorCode": "incomplete_pack",
            },
        ],
    }
    _install_drain_doubles(
        monkeypatch, jobs=jobs, trigger_result=trigger_result, brand=brand_stub
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["ready"] == 0
    assert out["failed"] == 2
    assert jobs.ready == []
    assert [retryable for _, _, retryable in jobs.failed] == [False, False]


async def test_drain_marks_gallery_theme_mismatch_non_retryable(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=False)
    batch = [_job(5, "campaign_story_motion")]
    jobs = _JobsRecorder(
        claim_batches=[batch],
        summary={"total": 1, "complete": False, "active": 0, "failed": 1, "ready": 0},
    )
    trigger_result = {
        "results": [
            {
                "slotKey": "5:campaign_story_motion",
                "error": 'Caption–görsel tema çatışması — "Zeytinyağı" için uygun galeri fotoğrafı yok',
                "errorCode": "gallery_theme_mismatch",
            },
        ],
    }
    _install_drain_doubles(
        monkeypatch, jobs=jobs, trigger_result=trigger_result, brand=brand_stub
    )

    await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert len(jobs.failed) == 1
    assert jobs.failed[0][2] is False


async def test_drain_bullmq_enqueues_only_and_leaves_jobs_running(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=True)
    batch = [_job(0, "story"), _job(1, "reel")]
    jobs = _JobsRecorder(
        claim_batches=[batch],
        summary={"total": 2, "complete": False, "active": 2, "failed": 0, "ready": 0},
    )
    captured: dict = {}
    rekicks = _install_drain_doubles(
        monkeypatch,
        jobs=jobs,
        trigger_result={"reason": "enqueued_to_bullmq"},
        brand=brand_stub,
        capture_trigger_kwargs=captured,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["enqueued"] == 2
    assert out["ready"] == 0
    assert out["failed"] == 0
    # Jobs are marked running but NOT ready/failed — the worker callback owns that.
    assert jobs.running == [batch[0]["id"], batch[1]["id"]]
    assert jobs.ready == []
    assert jobs.failed == []
    # Safety-net continuation drain when BullMQ batch is enqueued but jobs stay open.
    assert len(rekicks) == 1
    assert rekicks[0][1].get("force") is True
    # The trigger was invoked in enqueue-only mode with the factory job refs.
    assert captured["enqueue_only"] is True
    assert captured["factory_jobs"] == [
        {"id": str(batch[0]["id"]), "slotKey": "0:story"},
        {"id": str(batch[1]["id"]), "slotKey": "1:reel"},
    ]


async def test_drain_bullmq_failed_enqueue_marks_batch_failed(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=True)
    batch = [_job(0, "story")]
    jobs = _JobsRecorder(
        claim_batches=[batch],
        summary={"total": 1, "complete": False, "active": 0, "failed": 1, "ready": 0},
    )
    # Trigger returns something other than the enqueue sentinel → enqueue failed.
    _install_drain_doubles(
        monkeypatch, jobs=jobs, trigger_result={"reason": "nope"}, brand=brand_stub
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["enqueued"] == 0
    assert out["failed"] == 1
    assert [reason for _, reason, _ in jobs.failed] == ["nope"]


async def test_drain_bullmq_enqueue_lock_defers_batch(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=True)
    batch = [_job(0, "story")]
    jobs = _JobsRecorder(
        claim_batches=[batch],
        summary={"total": 1, "complete": False, "active": 1, "failed": 0, "ready": 0},
    )
    _install_drain_doubles(
        monkeypatch,
        jobs=jobs,
        trigger_result={"reason": "enqueue_failed"},
        brand=brand_stub,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["failed"] == 0
    assert jobs.deferred == [(batch[0]["id"], "enqueue_failed")]
    assert jobs.running == []


async def test_apply_bullmq_completion_marks_by_slotkey_and_rekicks_when_open(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    j1, j2 = uuid.uuid4(), uuid.uuid4()
    mission_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    factory_jobs = [
        {"id": str(j1), "slotKey": "0:story"},
        {"id": str(j2), "slotKey": "1:post"},
    ]
    ready: list = []
    failed: list = []

    async def _mark_ready(job_id, *, artifact_id=None):
        ready.append((job_id, artifact_id))

    async def _mark_failed(job_id, reason, **kwargs):
        failed.append((job_id, reason))
        return "failed"

    async def _has_open(mission_id):
        return True

    async def _workspace_for_mission(_mission_id):
        return workspace_id

    monkeypatch.setattr(pfs.jobs, "mark_ready", _mark_ready, raising=True)
    monkeypatch.setattr(pfs.jobs, "mark_failed", _mark_failed, raising=True)
    monkeypatch.setattr(pfs.jobs, "has_open_jobs", _has_open, raising=True)
    monkeypatch.setattr(pfs.jobs, "has_runnable_jobs", _has_open, raising=True)
    monkeypatch.setattr(pfs, "_workspace_for_mission", _workspace_for_mission, raising=True)

    async def _fake_finalize(mission_id):
        return {"total": 2, "complete": False, "ready": 1, "active": 0, "failed": 1}

    monkeypatch.setattr(pfs, "_finalize_mission_production_state", _fake_finalize, raising=True)

    rekicks: list = []
    monkeypatch.setattr(pfs, "schedule_drain", lambda *a, **k: rekicks.append((a, k)), raising=True)

    produce_data = {"results": [{"slotKey": "0:story", "id": "art-0", "publishReady": True}]}
    out = await pfs.apply_bullmq_completion(mission_id, workspace_id, factory_jobs, produce_data)

    assert out["ready"] == 1
    assert out["failed"] == 1
    assert ready == [(j1, "art-0")]
    assert [jid for jid, _ in failed] == [j2]
    # Open jobs remain and mission is not complete → a follow-up drain is scheduled.
    assert len(rekicks) == 1
    assert rekicks[0][1].get("force") is True


async def test_drain_all_open_missions_schedules_with_force(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mid = uuid.uuid4()
    wid = uuid.uuid4()
    scheduled: list = []

    async def _list_open(limit: int = 25):
        return [str(mid)]

    async def _workspace_for_mission(mission_id):
        return wid

    monkeypatch.setattr(pfs.jobs, "list_missions_with_open_jobs", _list_open, raising=True)
    monkeypatch.setattr(pfs, "_workspace_for_mission", _workspace_for_mission, raising=True)
    monkeypatch.setattr(
        pfs,
        "schedule_drain",
        lambda *a, **k: scheduled.append((a, k)),
        raising=True,
    )

    count = await pfs.drain_all_open_missions(limit=5)

    assert count == 1
    assert scheduled[0][1].get("force") is True


async def test_factory_watchdog_reclaims_and_schedules_drains(
    monkeypatch: pytest.MonkeyPatch, patch_settings
) -> None:
    patch_settings(use_bullmq_executor=True)
    mid = str(uuid.uuid4())
    reclaimed: list[str] = []

    async def _list_any(limit: int = 50):
        return [mid]

    async def _reclaim(mission_id: uuid.UUID, *, stale_sec: int = 600):
        reclaimed.append(str(mission_id))
        return 1

    async def _drain_all(limit: int = 25):
        return 2

    async def _exhaust(*, limit: int = 80):
        return 3

    async def _silent(*_a, **_k):
        return 0

    monkeypatch.setattr(
        pfs.jobs, "list_mission_ids_with_any_open_jobs", _list_any, raising=True
    )
    monkeypatch.setattr(pfs.jobs, "reclaim_silent_inflight", _silent, raising=True)
    monkeypatch.setattr(pfs.jobs, "reclaim_stale_jobs", _reclaim, raising=True)
    monkeypatch.setattr(
        pfs.jobs, "exhaust_open_terminal_error_jobs", _exhaust, raising=True
    )
    monkeypatch.setattr(pfs, "drain_all_open_missions", _drain_all, raising=True)

    out = await pfs.run_factory_watchdog_tick(reclaim_limit=10)

    assert out == {"reclaimed": 1, "drained": 2, "exhausted": 3}
    assert reclaimed == [mid]


class _JobsRecorderWithRekick(_JobsRecorder):
    """Like _JobsRecorder but reports open jobs on every check so follow-up drain fires."""

    async def has_open_jobs(self, mission_id: uuid.UUID) -> bool:
        return True


async def test_drain_follow_up_schedules_with_force(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=False, auto_feed_production_enabled=False)
    batch = [_job(0, "story")]
    jobs = _JobsRecorderWithRekick(
        claim_batches=[batch, []],
        summary={"total": 1, "complete": False, "active": 0, "failed": 0, "ready": 0},
    )
    rekicks = _install_drain_doubles(
        monkeypatch,
        jobs=jobs,
        trigger_result={"results": [{"slotKey": "0:story", "id": "art-0", "publishReady": True}]},
        brand=brand_stub,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["ready"] == 1
    assert len(rekicks) == 1
    assert rekicks[0][1].get("force") is True


async def test_drain_skips_follow_up_when_only_deferred_jobs_remain(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    """Quota/lock defer is open but not runnable — do not kick drain again."""
    patch_settings(use_bullmq_executor=False, auto_feed_production_enabled=False)
    batch = [_job(0, "story")]

    class _DeferredOnly(_JobsRecorder):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._runnable_checks = 0

        async def has_open_jobs(self, mission_id: uuid.UUID) -> bool:
            return True

        async def has_runnable_jobs(self, mission_id: uuid.UUID) -> bool:
            self._runnable_checks += 1
            # First check: enter drain. After the batch: only deferred remain.
            return self._runnable_checks == 1

    jobs = _DeferredOnly(
        claim_batches=[batch, []],
        summary={"total": 1, "complete": False, "active": 0, "failed": 0, "ready": 1},
    )
    rekicks = _install_drain_doubles(
        monkeypatch,
        jobs=jobs,
        trigger_result={"results": [{"slotKey": "0:story", "id": "art-0", "publishReady": True}]},
        brand=brand_stub,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["ready"] == 1
    assert rekicks == []


async def test_drain_does_not_claim_shop_or_beach_while_mission_in_flight(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=True)
    shop = _job(0, "fal_designed_post")
    beach = _job(1, "fal_designed_story")
    jobs = _JobsRecorder(
        claim_batches=[[shop, beach]],
        summary={"total": 2, "complete": False, "active": 1, "failed": 0, "ready": 0},
    )
    jobs.live_in_flight = True
    capture: dict = {}
    _install_drain_doubles(
        monkeypatch,
        jobs=jobs,
        trigger_result={"reason": "enqueued_to_bullmq"},
        brand=brand_stub,
        capture_trigger_kwargs=capture,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["claimed"] == 0
    assert out["enqueued"] == 0
    assert capture == {}
    assert jobs.deferred == []


async def test_drain_timeout_keeps_shop_and_beach_running(
    monkeypatch: pytest.MonkeyPatch, patch_settings, brand_stub
) -> None:
    patch_settings(use_bullmq_executor=False)
    shop = _job(0, "fal_designed_post")
    beach = _job(1, "fal_designed_story")
    jobs = _JobsRecorder(
        claim_batches=[[shop, beach]],
        summary={"total": 2, "complete": False, "active": 2, "failed": 0, "ready": 0},
    )
    _install_drain_doubles(
        monkeypatch,
        jobs=jobs,
        trigger_result={
            "produced": 0,
            "skipped": True,
            "reason": "production_in_flight",
            "code": "route_still_running",
        },
        brand=brand_stub,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert jobs.deferred == []
    assert jobs.running == [shop["id"], beach["id"]]
    assert out["claimed"] == 2
