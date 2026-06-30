"""Characterization tests for CrewEngine._dispatch routing.

Locks which crew runner each (agent_role, task_type) pair invokes, so the
registry-table refactor is provably behavior-identical. All run_* crew functions
are replaced with recorders; no real CrewAI execution happens.
"""

from __future__ import annotations

import json
import types

import pytest

import app.crew.engine as engine

RUNNERS = [
    "run_review_analysis",
    "run_single_review_response",
    "run_content_ideation",
    "run_content_calendar",
    "run_visual_design_cards",
    "run_content_strategy",
    "run_feed_art_director",
    "run_campaign_analysis",
    "run_ad_creative_generation",
    "run_budget_optimization",
    "run_traffic_analysis",
    "run_conversion_report",
    "run_weekly_performance",
    "run_mission_planning",
]

# (agent_role, task_type) -> the runner expected to be called
PAIRS = [
    ("review_agent", "review_analysis", "run_review_analysis"),
    ("review_agent", "single_review_response", "run_single_review_response"),
    ("content_agent", "content_ideation", "run_content_ideation"),
    ("content_agent", "content_calendar", "run_content_calendar"),
    ("content_agent", "visual_design_cards", "run_visual_design_cards"),
    ("content_strategy_agent", "content_strategy", "run_content_strategy"),
    ("feed_art_director", "feed_cohesion_review", "run_feed_art_director"),
    ("ads_agent", "campaign_analysis", "run_campaign_analysis"),
    ("ads_agent", "ad_creative_generation", "run_ad_creative_generation"),
    ("ads_agent", "auto_budget_optimize", "run_budget_optimization"),
    ("ads_agent", "ads_budget_optimization", "run_budget_optimization"),
    ("analytics_agent", "traffic_analysis", "run_traffic_analysis"),
    ("analytics_agent", "conversion_report", "run_conversion_report"),
    ("analytics_agent", "weekly_performance", "run_weekly_performance"),
    ("strategic_agent", "mission_planning", "run_mission_planning"),
]


def _brand():
    return types.SimpleNamespace(
        business_name="b",
        tenant_id="t",
        languages="tr",
        used_images_by_type=None,
        used_image_urls=None,
    )


@pytest.fixture
def recorders(monkeypatch):
    calls: list[str] = []

    def _make(name):
        def _fn(*_a, **_k):
            calls.append(name)
            # feed_art_director returns a report dict; others a result dict
            if name == "run_feed_art_director":
                return {"report": True}
            return {"status": "completed", "runner": name}

        return _fn

    for r in RUNNERS:
        monkeypatch.setattr(engine, r, _make(r))
    return calls


@pytest.mark.parametrize("role,task,expected", PAIRS)
def test_dispatch_routes_to_expected_runner(recorders, role, task, expected):
    eng = engine.CrewEngine()
    out = eng._dispatch(role, task, _brand(), {"iterations": 1}, llm=object())
    assert recorders == [expected]
    if role == "feed_art_director":
        assert out["crew_name"] == "feed_art_director_crew"
        assert out["status"] == "completed"
        assert json.loads(out["raw_output"]) == {"report": True}
    else:
        assert out["runner"] == expected


def test_content_agent_applies_image_overrides(recorders):
    eng = engine.CrewEngine()
    brand = _brand()
    eng._dispatch(
        "content_agent",
        "content_calendar",
        brand,
        {"used_images_by_type": {"post": ["u1"]}, "used_image_urls": ["u2"]},
        llm=object(),
    )
    assert brand.used_images_by_type == {"post": ["u1"]}
    assert brand.used_image_urls == ["u2"]


def test_dispatch_unhandled_pair_raises(recorders):
    eng = engine.CrewEngine()
    with pytest.raises(ValueError):
        eng._dispatch("review_agent", "nonexistent_task", _brand(), {}, llm=object())
