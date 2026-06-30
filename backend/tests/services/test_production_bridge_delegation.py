"""Seam-contract tests for :mod:`app.services.production_bridge`.

``production_bridge`` is the stable public surface that callers depend on instead
of reaching into ``task_graph_executor`` internals (b1b). Each function lazily
imports its implementation and forwards to it. These tests lock that contract:
the bridge must call the implementation with the caller's arguments and return
its result unchanged — so the implementation can be relocated behind the seam
without breaking callers.

No live DB or network: every implementation symbol is monkeypatched.
"""

from __future__ import annotations

import pytest

from app.services import production_bridge as bridge

# Import the implementation modules at collection time (real settings) so the
# shared async engine in ``app.database`` exists before any fixture installs a
# stub — keeps this file green when run in isolation, not just the full suite.
from app.services import production_trigger as _production_trigger  # noqa: F401
from app.services import task_graph_executor as _task_graph_executor  # noqa: F401


async def test_trigger_auto_produce_forwards_kwargs_to_production_trigger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    async def _fake_impl(**kwargs):
        captured.update(kwargs)
        return {"ok": True, "results": []}

    monkeypatch.setattr(
        "app.services.production_trigger.trigger_auto_produce", _fake_impl, raising=True
    )

    out = await bridge.trigger_auto_produce(mission_id="m-1", enqueue_only=True)

    assert out == {"ok": True, "results": []}
    assert captured == {"mission_id": "m-1", "enqueue_only": True}


async def test_load_visual_design_nodes_delegates_to_executor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict = {}

    async def _fake(mission_id):
        seen["mission_id"] = mission_id
        return [{"node": "vd-1"}]

    monkeypatch.setattr(
        "app.services.task_graph_executor._load_visual_design_nodes", _fake, raising=True
    )

    out = await bridge.load_visual_design_nodes("m-42")

    assert out == [{"node": "vd-1"}]
    assert seen == {"mission_id": "m-42"}


def test_parse_calendar_plans_from_nodes_delegates_to_executor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict = {}

    def _fake(nodes):
        seen["nodes"] = nodes
        return [{"plan": 1}]

    monkeypatch.setattr(
        "app.services.task_graph_executor._parse_calendar_plans_from_nodes",
        _fake,
        raising=True,
    )

    nodes = [{"raw": "node"}]
    out = bridge.parse_calendar_plans_from_nodes(nodes)

    assert out == [{"plan": 1}]
    assert seen == {"nodes": nodes}


async def test_record_mission_production_failure_forwards_args(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict = {}

    async def _fake(*args, **kwargs):
        seen["args"] = args
        seen["kwargs"] = kwargs
        return "recorded"

    monkeypatch.setattr(
        "app.services.task_graph_executor._record_mission_production_failure",
        _fake,
        raising=True,
    )

    out = await bridge.record_mission_production_failure("m-7", reason="boom")

    assert out == "recorded"
    assert seen == {"args": ("m-7",), "kwargs": {"reason": "boom"}}


def test_get_session_factory_returns_shared_async_session_factory() -> None:
    from app.database import async_session_factory

    assert bridge.get_session_factory() is async_session_factory
