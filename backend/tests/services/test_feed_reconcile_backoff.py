"""Reconcile safety net: zombies back off and stop, fresh missions stay eligible."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services import task_graph_executor as tge


def test_fresh_mission_is_eligible() -> None:
    assert tge.feed_reconcile_eligible({}) is True
    assert tge.feed_reconcile_eligible({"feed_reconcile": {}}) is True


def test_backoff_grows_and_caps() -> None:
    assert tge.feed_reconcile_backoff_sec(0) == 0
    assert tge.feed_reconcile_backoff_sec(1) == 15 * 60
    assert tge.feed_reconcile_backoff_sec(2) == 30 * 60
    assert tge.feed_reconcile_backoff_sec(3) == 60 * 60
    assert tge.feed_reconcile_backoff_sec(40) == 24 * 3600


def test_recent_attempt_blocks_until_backoff_elapses() -> None:
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    perf = {"feed_reconcile": {"attempts": 2, "last_at": (now - timedelta(minutes=10)).isoformat()}}
    assert tge.feed_reconcile_eligible(perf, now=now) is False
    perf = {"feed_reconcile": {"attempts": 2, "last_at": (now - timedelta(minutes=31)).isoformat()}}
    assert tge.feed_reconcile_eligible(perf, now=now) is True


def test_exhausted_attempts_leave_mission_to_operator() -> None:
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    perf = {
        "feed_reconcile": {
            "attempts": tge.FEED_RECONCILE_MAX_ATTEMPTS,
            "last_at": (now - timedelta(days=9)).isoformat(),
        }
    }
    assert tge.feed_reconcile_eligible(perf, now=now) is False
