"""Production factory enqueue guards — empty plan must not silently mark factory ready."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.production_factory_service import enqueue_mission_jobs


@pytest.mark.asyncio
async def test_enqueue_mission_jobs_raises_when_plan_has_no_slots() -> None:
    mission_id = uuid.uuid4()
    workspace_id = uuid.uuid4()

    with patch(
        "app.services.production_bridge.trigger_auto_produce",
        new_callable=AsyncMock,
        return_value={"slots": [], "error": "plan_timeout"},
    ):
        with pytest.raises(RuntimeError, match="plan_timeout"):
            await enqueue_mission_jobs(
                workspace_id=workspace_id,
                mission_id=mission_id,
                node_key="ideas",
                output_summary="[]",
                brand=None,
                feed_director_report=None,
            )


@pytest.mark.asyncio
async def test_enqueue_mission_jobs_inserts_when_plan_has_slots() -> None:
    mission_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    slots = [
        {
            "ideaIndex": 0,
            "slotRole": "organic_post",
            "format": "post",
            "pipeline": "gallery_photo",
        },
    ]

    with patch(
        "app.services.production_bridge.trigger_auto_produce",
        new_callable=AsyncMock,
        return_value={"slots": slots, "slotCount": 1},
    ), patch(
        "app.services.production_job_service.upsert_jobs",
        new_callable=AsyncMock,
        return_value=1,
    ) as mock_upsert:
        inserted = await enqueue_mission_jobs(
            workspace_id=workspace_id,
            mission_id=mission_id,
            node_key="ideas",
            output_summary="[]",
            brand=None,
            feed_director_report=None,
        )

    assert inserted == 1
    mock_upsert.assert_awaited_once_with(
        workspace_id, mission_id, "ideas", slots,
    )
