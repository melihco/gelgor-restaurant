"""Unit tests for brand_bootstrap_service.

Locks the contract that confirm-constitution relies on: scheduling fires exactly
the three best-effort bootstrap tasks (theme, intelligence, service profile),
each with the workspace id, and a failing task never propagates.
"""

from __future__ import annotations

import asyncio
import uuid

import app.services.brand_bootstrap_service as svc


def test_schedule_creates_three_bootstrap_tasks(monkeypatch) -> None:
    calls: list[tuple[str, uuid.UUID]] = []

    def _stub(name: str):
        async def _fn(workspace_id: uuid.UUID) -> None:
            calls.append((name, workspace_id))

        return _fn

    monkeypatch.setattr(svc, "_bootstrap_theme", _stub("theme"))
    monkeypatch.setattr(svc, "_bootstrap_intelligence", _stub("intelligence"))
    monkeypatch.setattr(svc, "_bootstrap_service_profile", _stub("service_profile"))

    ws = uuid.uuid4()

    async def _run() -> int:
        tasks = svc.schedule_post_constitution_bootstrap(ws)
        await asyncio.gather(*tasks)
        return len(tasks)

    count = asyncio.run(_run())

    assert count == 3
    assert sorted(name for name, _ in calls) == ["intelligence", "service_profile", "theme"]
    assert {ws_id for _, ws_id in calls} == {ws}


def test_bootstrap_task_swallows_errors(monkeypatch) -> None:
    # A broken dependency must not raise out of the best-effort task.
    def _boom(*_a, **_k):
        raise RuntimeError("db down")

    monkeypatch.setattr("app.database.async_session_factory", _boom, raising=False)

    async def _run() -> None:
        await svc._bootstrap_service_profile(uuid.uuid4())

    asyncio.run(_run())  # must not raise
