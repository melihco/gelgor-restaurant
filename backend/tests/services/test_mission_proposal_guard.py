"""Tests for mission proposal gating."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.models.mission import Mission
from app.schemas.mission import MissionStatus
from app.services.mission_proposal_guard import resolve_mission_proposal_block


def _mission(status: str, title: str = "Test mission") -> Mission:
    m = Mission()
    m.id = uuid.uuid4()
    m.workspace_id = uuid.uuid4()
    m.title = title
    m.status = status
    m.type = "weekly_content"
    m.performance_summary = {}
    return m


@pytest.mark.asyncio
async def test_blocks_when_proposed_mission_exists():
    proposed = _mission(MissionStatus.PROPOSED.value, "Bekleyen öneri")
    with patch(
        "app.services.mission_proposal_guard.list_blocking_missions",
        AsyncMock(return_value=[proposed]),
    ):
        block = await resolve_mission_proposal_block(AsyncMock(), proposed.workspace_id)
    assert block is not None
    assert block.reason == "awaiting_approval"
    assert "Bekleyen öneri" in block.message


@pytest.mark.asyncio
async def test_blocks_when_active_mission_feed_incomplete():
    active = _mission(MissionStatus.IN_FLIGHT.value, "Üretimde")
    with patch(
        "app.services.mission_proposal_guard.list_blocking_missions",
        AsyncMock(return_value=[active]),
    ), patch(
        "app.services.mission_proposal_guard.is_mission_feed_production_complete",
        AsyncMock(return_value=False),
    ):
        block = await resolve_mission_proposal_block(AsyncMock(), active.workspace_id)
    assert block is not None
    assert block.reason == "feed_incomplete"


@pytest.mark.asyncio
async def test_allows_when_active_mission_feed_complete():
    active = _mission(MissionStatus.IN_FLIGHT.value, "Feed hazır")
    with patch(
        "app.services.mission_proposal_guard.list_blocking_missions",
        AsyncMock(return_value=[active]),
    ), patch(
        "app.services.mission_proposal_guard.is_mission_feed_production_complete",
        AsyncMock(return_value=True),
    ):
        block = await resolve_mission_proposal_block(AsyncMock(), active.workspace_id)
    assert block is None


@pytest.mark.asyncio
async def test_allows_when_no_blocking_missions():
    ws = uuid.uuid4()
    with patch(
        "app.services.mission_proposal_guard.list_blocking_missions",
        AsyncMock(return_value=[]),
    ):
        block = await resolve_mission_proposal_block(AsyncMock(), ws)
    assert block is None
