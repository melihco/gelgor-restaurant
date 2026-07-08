"""Mission completion must wait for the durable production factory."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.mission import MissionStatus, TaskNodeStatus
from app.services import task_graph_executor as tge


def _terminal_node_rows():
    return [
        MagicMock(node_key="content_ideation", status=TaskNodeStatus.COMPLETED.value),
        MagicMock(node_key="content_calendar", status=TaskNodeStatus.COMPLETED.value),
        MagicMock(node_key="feed_cohesion", status=TaskNodeStatus.COMPLETED.value),
        MagicMock(node_key="visual_design_cards", status=TaskNodeStatus.COMPLETED.value),
    ]


@pytest.mark.asyncio
async def test_check_and_complete_mission_defers_when_factory_incomplete(monkeypatch):
    mission_id = uuid.uuid4()

    async def fake_mission_job_summary(_mid: uuid.UUID) -> dict:
        return {
            "mission_id": str(mission_id),
            "total": 17,
            "ready": 3,
            "failed": 1,
            "active": 2,
            "complete": False,
            "slots": [],
        }

    monkeypatch.setattr(
        "app.services.production_job_service.mission_job_summary",
        fake_mission_job_summary,
    )

    db = AsyncMock()
    node_result = MagicMock()
    node_result.all.return_value = _terminal_node_rows()
    status_result = MagicMock()
    status_result.one_or_none.return_value = (
        {"production_path": "factory"},
        MissionStatus.COMPLETED.value,
    )
    db.execute = AsyncMock(side_effect=[node_result, status_result, MagicMock()])

    done = await tge._check_and_complete_mission(db, mission_id)

    assert done is False
    assert db.execute.await_count == 3
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_check_and_complete_mission_proceeds_when_factory_complete(monkeypatch):
    mission_id = uuid.uuid4()

    async def fake_mission_job_summary(_mid: uuid.UUID) -> dict:
        return {
            "mission_id": str(mission_id),
            "total": 17,
            "ready": 17,
            "failed": 0,
            "active": 0,
            "complete": True,
            "slots": [],
        }

    monkeypatch.setattr(
        "app.services.production_job_service.mission_job_summary",
        fake_mission_job_summary,
    )

    db = AsyncMock()
    node_result = MagicMock()
    node_result.all.return_value = _terminal_node_rows()[:2]
    status_result = MagicMock()
    status_result.one_or_none.return_value = (
        {"production_path": "factory"},
        MissionStatus.IN_FLIGHT.value,
    )
    db.execute = AsyncMock(side_effect=[node_result, status_result, MagicMock()])

    done = await tge._check_and_complete_mission(db, mission_id)

    assert done is True
    assert db.execute.await_count == 3
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_check_and_complete_mission_proceeds_when_no_factory_jobs(monkeypatch):
    mission_id = uuid.uuid4()

    async def fake_mission_job_summary(_mid: uuid.UUID) -> dict:
        return {
            "mission_id": str(mission_id),
            "total": 0,
            "ready": 0,
            "failed": 0,
            "active": 0,
            "complete": False,
            "slots": [],
        }

    monkeypatch.setattr(
        "app.services.production_job_service.mission_job_summary",
        fake_mission_job_summary,
    )

    db = AsyncMock()
    node_result = MagicMock()
    node_result.all.return_value = _terminal_node_rows()[:2]
    status_result = MagicMock()
    status_result.one_or_none.return_value = ({}, MissionStatus.IN_FLIGHT.value)
    db.execute = AsyncMock(side_effect=[node_result, status_result, MagicMock()])

    done = await tge._check_and_complete_mission(db, mission_id)

    assert done is True
    db.commit.assert_awaited_once()


def test_node_stale_threshold_content_ideation_orphan_uses_long_window():
    orphan = tge._node_stale_threshold_seconds(
        "content_ideation", {"count": 10, "iterations": 1}, is_orphan=True
    )
    active = tge._node_stale_threshold_seconds(
        "content_ideation", {"count": 10, "iterations": 1}, is_orphan=False
    )
    assert orphan >= 500
    assert active >= orphan
    assert tge._node_stale_threshold_seconds("content_calendar", {}, is_orphan=True) >= 45
