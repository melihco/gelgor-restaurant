"""Provider adapters must not fake live success outside explicit dev simulate."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.api.v1 import provider_actions as pa


@pytest.mark.asyncio
async def test_instagram_schedule_token_still_not_implemented():
    with patch.object(pa, "get_settings", return_value=SimpleNamespace(is_development=False)):
        body = await pa.schedule_instagram_posts(
            pa.InstagramScheduleRequest(
                account_id="act_1",
                access_token="tok_x",
                posts=[{"caption": "hello"}],
            ),
            allow_simulate=False,
        )
    assert body["success"] is False
    assert body["status"] == "not_implemented"


@pytest.mark.asyncio
async def test_google_reply_token_still_not_implemented():
    with patch.object(pa, "get_settings", return_value=SimpleNamespace(is_development=False)):
        body = await pa.reply_to_google_review(
            pa.GoogleReviewReplyRequest(
                account_id="acc",
                review_id="rev_1",
                reply_text="Thanks!",
                access_token="tok_x",
            ),
            allow_simulate=False,
        )
    assert body["success"] is False
    assert body["status"] == "not_implemented"


@pytest.mark.asyncio
async def test_dev_simulate_opt_in():
    with patch.object(pa, "get_settings", return_value=SimpleNamespace(is_development=True)):
        body = await pa.schedule_instagram_posts(
            pa.InstagramScheduleRequest(posts=[{"caption": "sim"}]),
            allow_simulate=True,
        )
    assert body["success"] is True
    assert body["status"] == "simulated"


@pytest.mark.asyncio
async def test_prod_ignores_allow_simulate_flag():
    with patch.object(pa, "get_settings", return_value=SimpleNamespace(is_development=False)):
        body = await pa.schedule_instagram_posts(
            pa.InstagramScheduleRequest(
                access_token="tok",
                posts=[{"caption": "x"}],
            ),
            allow_simulate=True,
        )
    assert body["success"] is False
    assert body["status"] == "not_implemented"
