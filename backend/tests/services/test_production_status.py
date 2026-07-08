"""Tests for production phase resolution (Mission Hub status)."""

from app.services.production_status import resolve_production_phase


def test_phase_idle_when_no_factory_jobs() -> None:
    out = resolve_production_phase({"total": 0, "ready": 0, "slots": []})
    assert out["phase"] == "idle"
    assert out["blockReason"] is None


def test_phase_producing_when_in_flight() -> None:
    out = resolve_production_phase(
        {"total": 18, "ready": 0, "inFlight": 2, "queued": 16, "complete": False, "slots": []},
    )
    assert out["phase"] == "producing"
    assert out["estimatedWaitMinutes"] is not None


def test_phase_queued_platform_when_backlog_high() -> None:
    out = resolve_production_phase(
        {
            "total": 18,
            "ready": 0,
            "inFlight": 0,
            "queued": 18,
            "complete": False,
            "slots": [{"lastError": "bullmq enqueue failed"}],
        },
        platform_queue_depth=200,
    )
    assert out["phase"] == "queued"
    assert out["blockReason"] == "platform_queue"
    assert out["estimatedWaitMinutes"] == 120


def test_phase_partial_when_some_ready() -> None:
    out = resolve_production_phase(
        {"total": 18, "ready": 2, "inFlight": 0, "queued": 16, "complete": False, "slots": []},
    )
    assert out["phase"] == "partial"


def test_phase_brand_in_flight_block() -> None:
    out = resolve_production_phase(
        {
            "total": 18,
            "ready": 0,
            "inFlight": 0,
            "queued": 18,
            "failed": 0,
            "complete": False,
            "slots": [{"lastError": "production_in_flight"}],
        },
        platform_queue_depth=10,
    )
    assert out["phase"] == "queued"
    assert out["blockReason"] == "brand_in_flight"
