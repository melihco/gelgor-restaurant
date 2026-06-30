"""Tests for the Creative Director brand-safety review funneled through CrewEngine.

Previously orchestration.py reached into creative_director_crew directly and
resolved the LLM itself. These tests lock the engine-owned surface:
``is_brand_safety_reviewable`` gating and ``run_brand_safety_review`` delegation
(including that the engine-resolved LLM is passed through).
"""

from __future__ import annotations

import types

import pytest

import app.crew.crews.creative_director_crew as cd_crew
import app.crew.engine as engine


def _brand():
    return types.SimpleNamespace(business_name="b", tenant_id="t", languages="tr")


@pytest.mark.parametrize(
    "task_type,expected",
    [
        ("content_ideation", True),
        ("content_calendar", True),
        ("single_review_response", True),
        ("ad_creative_generation", True),
        ("traffic_analysis", False),
        ("mission_planning", False),
        ("", False),
    ],
)
def test_is_brand_safety_reviewable(task_type, expected):
    assert engine.CrewEngine().is_brand_safety_reviewable(task_type) is expected


def test_run_brand_safety_review_delegates_with_resolved_llm(monkeypatch):
    sentinel_llm = object()
    monkeypatch.setattr(engine, "get_llm", lambda task_type=None, brand=None: sentinel_llm)

    captured = {}

    def _fake_review(brand, raw_output, task_type, agent_role, llm=None):
        captured.update(
            brand=brand,
            raw_output=raw_output,
            task_type=task_type,
            agent_role=agent_role,
            llm=llm,
        )
        return {"approved": True, "tokens_used": 7}

    monkeypatch.setattr(cd_crew, "run_brand_safety_review", _fake_review)

    brand = _brand()
    out = engine.CrewEngine().run_brand_safety_review(
        brand, "some content", "content_ideation", "content_agent"
    )

    assert out == {"approved": True, "tokens_used": 7}
    assert captured["brand"] is brand
    assert captured["raw_output"] == "some content"
    assert captured["task_type"] == "content_ideation"
    assert captured["agent_role"] == "content_agent"
    assert captured["llm"] is sentinel_llm
