"""Unit tests for production-line telemetry helpers (no DB)."""

from __future__ import annotations

from app.services.production_line_telemetry_service import VALID_EVENT_TYPES, _percentile


def test_percentile_empty_and_single() -> None:
    assert _percentile([], 0.5) is None
    assert _percentile([10.0], 0.5) == 10.0


def test_percentile_p50_even() -> None:
    vals = [10.0, 20.0, 30.0, 40.0]
    assert _percentile(vals, 0.5) == 25.0


def test_valid_event_types_cover_lifecycle() -> None:
    for et in ("queued", "claimed", "running", "ready", "failed", "exhausted", "deferred", "skipped"):
        assert et in VALID_EVENT_TYPES
