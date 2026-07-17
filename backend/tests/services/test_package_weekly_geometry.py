"""Tests for plan-aware weekly package geometry."""

from app.services.package_weekly_geometry import (
    resolve_content_ideation_iterations,
    resolve_weekly_package_geometry,
)


def test_starter_geometry() -> None:
    geo = resolve_weekly_package_geometry("starter")
    assert geo["total"] == 11
    assert geo == {"post": 4, "story": 5, "carousel": 1, "reel": 1, "total": 11}


def test_agency_geometry_matches_live_mix() -> None:
    geo = resolve_weekly_package_geometry("growth")
    assert geo["total"] == 11
    assert geo["post"] == 4
    assert geo["reel"] == 1
    assert geo["story"] == 5


def test_content_ideation_iterations_default_one() -> None:
    # Cost-safe: plan slug no longer forces iterations=2
    assert resolve_content_ideation_iterations("starter") == 1
    assert resolve_content_ideation_iterations("growth") == 1


def test_content_ideation_timeouts_scale_with_package() -> None:
    from app.services.package_weekly_geometry import (
        resolve_content_ideation_agent_timeout_seconds,
        resolve_content_ideation_executor_timeout_seconds,
    )

    assert resolve_content_ideation_agent_timeout_seconds(11) >= 340
    assert resolve_content_ideation_executor_timeout_seconds(11, 1) >= 520
