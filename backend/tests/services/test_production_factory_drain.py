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


def test_slot_succeeded_counts_produced_rendering_or_publishready() -> None:
    assert pfs._slot_succeeded({"produced": 1}) is True
    assert pfs._slot_succeeded({"rendering": 2}) is True
    assert pfs._slot_succeeded({"publishReady": 1}) is True
    assert pfs._slot_succeeded({"produced": 0, "rendering": 0, "publishReady": 0}) is False
    assert pfs._slot_succeeded(None) is False
    assert pfs._slot_succeeded({}) is False


def test_artifact_id_from_returns_first_row_with_id() -> None:
    data = {"results": [{"error": "x"}, {"id": "art-1"}, {"id": "art-2"}]}
    assert pfs._artifact_id_from(data) == "art-1"
    assert pfs._artifact_id_from({"results": []}) is None
    assert pfs._artifact_id_from(None) is None


def test_succeeded_slot_map_keys_by_slotkey_skipping_errors_and_idless() -> None:
    data = {
        "results": [
            {"slotKey": "0:story", "id": "art-0"},
            {"slotKey": "1:post", "error": "withheld"},  # skipped (error)
            {"slotKey": "2:reel"},  # skipped (no id)
            {"id": "art-3"},  # skipped (no slotKey)
            {"slotKey": "3:carousel", "id": "art-3b"},
        ]
    }
    assert pfs._succeeded_slot_map(data) == {"0:story": "art-0", "3:carousel": "art-3b"}
    assert pfs._succeeded_slot_map(None) == {}


def test_slot_failure_map_extracts_per_slot_errors() -> None:
    data = {
        "results": [
            {"slotKey": "0:organic_post", "error": "Remotion 422: photo unreachable"},
            {"slotKey": "1:fal_only_post", "id": "art-1"},
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


def test_resolve_bullmq_batch_reason_unreachable_not_in_flight() -> None:
    assert pfs._resolve_bullmq_batch_reason(None, http_status=0) == "auto_produce_unreachable"
    assert pfs._resolve_bullmq_batch_reason(
        {"error": "fetch failed"}, http_status=0,
    ) == "fetch failed"
    assert pfs._resolve_bullmq_batch_reason(None, http_status=409) == "production_in_flight"


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
        self.running: list[uuid.UUID] = []

    async def has_open_jobs(self, mission_id: uuid.UUID) -> bool:
        return not self._summary.get("complete", False)

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

    async def mark_deferred(self, job_id: uuid.UUID, reason: str, *, delay_sec: float = 45.0) -> None:
        self.deferred.append((job_id, reason))

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
            {"slotKey": "0:story", "id": "art-story"},
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

    monkeypatch.setattr(pfs.jobs, "mark_ready", _mark_ready, raising=True)
    monkeypatch.setattr(pfs.jobs, "mark_failed", _mark_failed, raising=True)
    monkeypatch.setattr(pfs.jobs, "has_open_jobs", _has_open, raising=True)

    async def _fake_finalize(mission_id):
        return {"total": 2, "complete": False, "ready": 1, "active": 0, "failed": 1}

    monkeypatch.setattr(pfs, "_finalize_mission_production_state", _fake_finalize, raising=True)

    rekicks: list = []
    monkeypatch.setattr(pfs, "schedule_drain", lambda *a, **k: rekicks.append((a, k)), raising=True)

    produce_data = {"results": [{"slotKey": "0:story", "id": "art-0"}]}
    out = await pfs.apply_bullmq_completion(uuid.uuid4(), uuid.uuid4(), factory_jobs, produce_data)

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

    monkeypatch.setattr(
        pfs.jobs, "list_mission_ids_with_any_open_jobs", _list_any, raising=True
    )
    monkeypatch.setattr(pfs.jobs, "reclaim_stale_jobs", _reclaim, raising=True)
    monkeypatch.setattr(pfs, "drain_all_open_missions", _drain_all, raising=True)

    out = await pfs.run_factory_watchdog_tick(reclaim_limit=10)

    assert out == {"reclaimed": 1, "drained": 2}
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
        trigger_result={"results": [{"slotKey": "0:story", "id": "art-0"}]},
        brand=brand_stub,
    )

    out = await pfs.drain_production_jobs(uuid.uuid4(), uuid.uuid4())

    assert out["ready"] == 1
    assert len(rekicks) == 1
    assert rekicks[0][1].get("force") is True
