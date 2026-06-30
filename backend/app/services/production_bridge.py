"""ProductionBridge — the stable public surface for production orchestration.

Why this module exists
----------------------
The durable factory (``production_factory_service``) and the feed service
(``mission_feed_production_service``) used to reach **directly into private
symbols** of the 3,000-line ``task_graph_executor`` module
(``_trigger_auto_produce``, ``_load_*``, ``_mission_feed_*``). That broke
encapsulation and meant any internal signature change in the executor silently
rippled across three modules.

This module is the **seam**: callers now depend on a small, stable interface
(Dependency Inversion at the module boundary) instead of executor internals.
The heavy implementations still live in ``task_graph_executor`` for now and are
delegated to lazily; this lets the implementation be relocated behind this
interface later without touching any caller.

Only ``get_session_factory`` is a real (leaf) implementation here — it wraps the
single ``async_session_factory`` so the three former copy-pasted
``_get_session_factory`` helpers share one source.
"""

from __future__ import annotations

from typing import Any

from app.database import async_session_factory


def get_session_factory():
    """Return the shared async session factory (single source of truth)."""
    return async_session_factory


# ── Production trigger ────────────────────────────────────────────────────────


async def trigger_auto_produce(**kwargs: Any) -> dict | None:
    """Plan/produce/enqueue mission slots via the Next.js ``runProduction`` path.

    The implementation now lives in :mod:`app.services.production_trigger` (moved
    out of the 3k-line ``task_graph_executor`` god-module). Imported lazily so the
    seam stays cheap and tests can patch the implementation on its own module.
    """
    from app.services.production_trigger import trigger_auto_produce as _impl

    return await _impl(**kwargs)


async def trigger_content_production_pipeline(*args: Any, **kwargs: Any) -> dict | None:
    """Run the locked content production pipeline for a mission node."""
    from app.services.task_graph_executor import _trigger_content_production_pipeline

    return await _trigger_content_production_pipeline(*args, **kwargs)


# ── Mission node / ideation loaders ───────────────────────────────────────────


async def load_cached_feed_director_report(mission_id: Any) -> dict | None:
    from app.services.task_graph_executor import _load_cached_feed_director_report

    return await _load_cached_feed_director_report(mission_id)


async def load_content_ideation_nodes(mission_id: Any) -> list[dict]:
    from app.services.task_graph_executor import _load_content_ideation_nodes

    return await _load_content_ideation_nodes(mission_id)


async def load_content_calendar_nodes(mission_id: Any) -> list[dict]:
    from app.services.task_graph_executor import _load_content_calendar_nodes

    return await _load_content_calendar_nodes(mission_id)


async def load_visual_design_nodes(mission_id: Any) -> list[dict]:
    from app.services.task_graph_executor import _load_visual_design_nodes

    return await _load_visual_design_nodes(mission_id)


def parse_calendar_plans_from_nodes(nodes: list[dict]) -> list[dict]:
    from app.services.task_graph_executor import _parse_calendar_plans_from_nodes

    return _parse_calendar_plans_from_nodes(nodes)


async def load_mission_production_context(mission_id: Any) -> dict | None:
    from app.services.task_graph_executor import _load_mission_production_context

    return await _load_mission_production_context(mission_id)


async def record_mission_production_failure(*args: Any, **kwargs: Any) -> Any:
    from app.services.task_graph_executor import _record_mission_production_failure

    return await _record_mission_production_failure(*args, **kwargs)


# ── Mission feed state helpers ────────────────────────────────────────────────


async def record_mission_feed_produce_success(*args: Any, **kwargs: Any) -> Any:
    from app.services.task_graph_executor import _record_mission_feed_produce_success

    return await _record_mission_feed_produce_success(*args, **kwargs)


def mission_feed_package_complete(*args: Any, **kwargs: Any) -> bool:
    from app.services.task_graph_executor import _mission_feed_package_complete

    return _mission_feed_package_complete(*args, **kwargs)


def mission_feed_publish_ready_count(*args: Any, **kwargs: Any) -> int:
    from app.services.task_graph_executor import _mission_feed_publish_ready_count

    return _mission_feed_publish_ready_count(*args, **kwargs)


def schedule_ensure_mission_feed(*args: Any, **kwargs: Any) -> None:
    from app.services.task_graph_executor import _schedule_ensure_mission_feed

    _schedule_ensure_mission_feed(*args, **kwargs)
