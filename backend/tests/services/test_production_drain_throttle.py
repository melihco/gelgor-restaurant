"""Drain schedule throttle — prevents watchdog enqueue storms."""

from __future__ import annotations

import time
import uuid

import pytest

from app.services import production_factory_service as pfs


@pytest.mark.asyncio
async def test_schedule_drain_force_throttled_within_interval(
    monkeypatch: pytest.MonkeyPatch, patch_settings,
) -> None:
    patch_settings(
        production_drain_force_min_interval_sec=60.0,
        production_orchestrator="apscheduler",
    )
    pfs._last_drain_kick_monotonic.clear()
    pfs._scheduled_drain_tasks.clear()

    created: list[int] = []

    def _capture_task(coro, **kw):
        created.append(1)
        coro.close()

    monkeypatch.setattr(pfs.asyncio, "create_task", _capture_task)

    mid = uuid.uuid4()
    wid = uuid.uuid4()

    pfs.schedule_drain(mid, wid, delay_sec=0.0, force=True, bypass_throttle=False)
    pfs.schedule_drain(mid, wid, delay_sec=0.0, force=True, bypass_throttle=False)

    assert len(created) == 1


@pytest.mark.asyncio
async def test_schedule_drain_operator_bypasses_throttle(
    monkeypatch: pytest.MonkeyPatch, patch_settings,
) -> None:
    patch_settings(
        production_drain_force_min_interval_sec=60.0,
        production_orchestrator="apscheduler",
    )
    pfs._last_drain_kick_monotonic.clear()
    pfs._scheduled_drain_tasks.clear()
    pfs._last_drain_kick_monotonic[str(uuid.uuid4())] = time.monotonic()

    created: list[int] = []

    def _capture_task(coro, **kw):
        created.append(1)
        coro.close()

    monkeypatch.setattr(pfs.asyncio, "create_task", _capture_task)

    mid = uuid.uuid4()
    wid = uuid.uuid4()

    pfs.schedule_drain(mid, wid, delay_sec=0.0, force=True, bypass_throttle=True)

    assert len(created) == 1
