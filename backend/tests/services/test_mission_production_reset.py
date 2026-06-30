"""Tests for mission production clean-slate reset."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.mission_production_reset_service import reset_mission_production_state


@pytest.mark.asyncio
async def test_reset_deletes_jobs_and_archives_artifacts():
    db = AsyncMock()
    mission_id = uuid.uuid4()
    workspace_id = uuid.uuid4()

    job_result = MagicMock()
    job_result.fetchall.return_value = [(uuid.uuid4(),)] * 26
    art_result = MagicMock()
    art_result.fetchall.return_value = [(uuid.uuid4(),)] * 43
    perf_row = MagicMock()
    perf_row.one_or_none.return_value = (
        {"last_feed_produce": {"produced": 16}, "production_path": {"path": "factory"}},
    )

    db.execute = AsyncMock(side_effect=[job_result, art_result, perf_row, MagicMock()])

    with patch(
        "app.services.task_graph_executor._release_feed_production_lock",
        new_callable=AsyncMock,
    ):
        summary = await reset_mission_production_state(
            db,
            workspace_id=workspace_id,
            mission_id=mission_id,
        )

    assert summary["jobs_deleted"] == 26
    assert summary["artifacts_archived"] == 43
    assert summary["perf_cleared"] is True
    db.commit.assert_awaited_once()
