import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_cost_service import (
    ESTIMATED_COST_USD,
    TASK_TYPE_TO_CATEGORY,
    append_mission_ai_cost,
    empty_mission_cost_breakdown,
    estimate_cost_from_tokens,
    record_mission_category_cost,
    record_mission_task_ai_cost,
    record_workspace_ai_cost,
)


def test_estimate_cost_from_tokens_uses_known_model_rate() -> None:
    assert estimate_cost_from_tokens(5_000, "gpt-4o") == 0.0375


def test_estimate_cost_from_tokens_falls_back_to_default_rate() -> None:
    assert estimate_cost_from_tokens(2_000, "unknown-model") == 0.012


def test_estimate_cost_from_tokens_ignores_empty_or_negative_usage() -> None:
    assert estimate_cost_from_tokens(0, "gpt-4o") == 0.0
    assert estimate_cost_from_tokens(-10, "gpt-4o") == 0.0


def test_estimate_cost_from_tokens_matches_model_prefixes() -> None:
    assert estimate_cost_from_tokens(1_000, "claude-3-5-sonnet-20241022") == 0.009
    assert estimate_cost_from_tokens(1_000, "claude-sonnet-4-20250514") == 0.009
    assert estimate_cost_from_tokens(1_000, "gpt-4.1") == 0.008
    assert estimate_cost_from_tokens(1_000, "") == 0.006


def test_task_type_mapping_covers_feed_art_director_node() -> None:
    assert TASK_TYPE_TO_CATEGORY["feed_cohesion_review"] == "feed_art_director"
    assert ESTIMATED_COST_USD["feed_art_director"] > 0


def test_empty_mission_cost_breakdown() -> None:
    assert empty_mission_cost_breakdown() == {"total_usd": 0.0, "categories": {}}


@pytest.mark.asyncio
async def test_record_workspace_ai_cost_skips_zero_noop() -> None:
    db = AsyncMock()
    await record_workspace_ai_cost(db, uuid.uuid4(), "auto_produce", 0.0)
    # no record_cost import path when all counters are zero


@pytest.mark.asyncio
async def test_record_workspace_ai_cost_persists_via_usage_service() -> None:
    db = AsyncMock()
    ws = uuid.uuid4()
    with patch(
        "app.services.usage_cost_service.record_cost",
        new_callable=AsyncMock,
    ) as record_cost:
        await record_workspace_ai_cost(db, ws, "content_ideation", None, mission_count=1)
        record_cost.assert_awaited_once()
        assert record_cost.await_args.args[1] == ws
        assert record_cost.await_args.args[2] == ESTIMATED_COST_USD["content_ideation"]
        assert record_cost.await_args.args[3] == "content_ideation"


@pytest.mark.asyncio
async def test_record_workspace_ai_cost_swallows_usage_errors() -> None:
    db = AsyncMock()
    with patch(
        "app.services.usage_cost_service.record_cost",
        new_callable=AsyncMock,
        side_effect=RuntimeError("db down"),
    ):
        await record_workspace_ai_cost(db, uuid.uuid4(), "other", 0.1)


@pytest.mark.asyncio
async def test_append_mission_ai_cost_skips_non_positive() -> None:
    db = AsyncMock()
    await append_mission_ai_cost(db, uuid.uuid4(), "content_ideation", 0.0)
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_append_mission_ai_cost_returns_when_mission_missing() -> None:
    db = AsyncMock()
    result = MagicMock()
    result.one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)
    await append_mission_ai_cost(db, uuid.uuid4(), "content_ideation", 0.5)
    assert db.execute.await_count == 1
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_append_mission_ai_cost_merges_breakdown_and_ledger() -> None:
    db = AsyncMock()
    mission_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    select_result = MagicMock()
    select_result.one_or_none.return_value = (
        {"ai_cost_breakdown": {"content_ideation": 0.25, "total_usd": 0.25}},
        workspace_id,
    )
    db.execute = AsyncMock(return_value=select_result)
    db.commit = AsyncMock()

    with patch(
        "app.services.cost_ledger_service.record_mission_cost_line",
        new_callable=AsyncMock,
    ) as ledger:
        await append_mission_ai_cost(
            db,
            mission_id,
            "content_ideation",
            0.5,
            model="gpt-4o",
            tokens_in=100,
            idempotency_key="fixed-key",
        )
        ledger.assert_awaited_once()
        assert ledger.await_args.kwargs["idempotency_key"] == "fixed-key"
        assert ledger.await_args.kwargs["amount_usd"] == 0.5

    assert db.commit.await_count == 1
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_append_mission_ai_cost_swallows_ledger_errors() -> None:
    db = AsyncMock()
    select_result = MagicMock()
    select_result.one_or_none.return_value = ({}, uuid.uuid4())
    db.execute = AsyncMock(return_value=select_result)
    db.commit = AsyncMock()
    with patch(
        "app.services.cost_ledger_service.record_mission_cost_line",
        new_callable=AsyncMock,
        side_effect=RuntimeError("ledger down"),
    ):
        await append_mission_ai_cost(db, uuid.uuid4(), "scene_brief", 0.15)


@pytest.mark.asyncio
async def test_record_mission_task_ai_cost_ignores_unknown_task() -> None:
    db = AsyncMock()
    await record_mission_task_ai_cost(db, uuid.uuid4(), uuid.uuid4(), "unknown_task")
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_record_mission_task_ai_cost_uses_token_pricing() -> None:
    db = AsyncMock()
    ws = uuid.uuid4()
    mid = uuid.uuid4()
    with (
        patch(
            "app.services.ai_cost_service.record_workspace_ai_cost",
            new_callable=AsyncMock,
        ) as ws_cost,
        patch(
            "app.services.ai_cost_service.append_mission_ai_cost",
            new_callable=AsyncMock,
        ) as mission_cost,
    ):
        await record_mission_task_ai_cost(
            db, ws, mid, "content_ideation", tokens_used=2000, model="gpt-4o"
        )
        expected = estimate_cost_from_tokens(2000, "gpt-4o")
        ws_cost.assert_awaited_once_with(db, ws, "content_ideation", expected)
        assert mission_cost.await_args.args[3] == expected
        assert mission_cost.await_args.kwargs["model"] == "gpt-4o"


@pytest.mark.asyncio
async def test_record_mission_task_ai_cost_falls_back_to_static_estimate() -> None:
    db = AsyncMock()
    with (
        patch(
            "app.services.ai_cost_service.record_workspace_ai_cost",
            new_callable=AsyncMock,
        ) as ws_cost,
        patch(
            "app.services.ai_cost_service.append_mission_ai_cost",
            new_callable=AsyncMock,
        ),
    ):
        await record_mission_task_ai_cost(
            db, uuid.uuid4(), uuid.uuid4(), "content_strategy", tokens_used=0
        )
        assert ws_cost.await_args.args[3] == ESTIMATED_COST_USD["content_strategy"]


@pytest.mark.asyncio
async def test_record_mission_category_cost_delegates() -> None:
    db = AsyncMock()
    ws = uuid.uuid4()
    mid = uuid.uuid4()
    with (
        patch(
            "app.services.ai_cost_service.record_workspace_ai_cost",
            new_callable=AsyncMock,
        ) as ws_cost,
        patch(
            "app.services.ai_cost_service.append_mission_ai_cost",
            new_callable=AsyncMock,
        ) as mission_cost,
    ):
        await record_mission_category_cost(db, ws, mid, "gallery_vision_analysis")
        amt = ESTIMATED_COST_USD["gallery_vision_analysis"]
        ws_cost.assert_awaited_once_with(db, ws, "gallery_vision_analysis", amt)
        mission_cost.assert_awaited_once_with(db, mid, "gallery_vision_analysis", amt)
