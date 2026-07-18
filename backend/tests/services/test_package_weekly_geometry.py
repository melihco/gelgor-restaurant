"""Tests for plan-aware weekly package geometry."""

from app.services.package_weekly_geometry import (
    resolve_content_ideation_iterations,
    resolve_weekly_package_geometry,
)


def test_starter_geometry() -> None:
    geo = resolve_weekly_package_geometry("starter")
    assert geo["total"] == 15
    assert geo == {"post": 4, "story": 8, "carousel": 1, "reel": 2, "total": 15}


def test_agency_geometry_matches_mix() -> None:
    geo = resolve_weekly_package_geometry("growth")
    assert geo["total"] == 15
    assert geo["post"] == 4
    assert geo["story"] == 8
    assert geo["reel"] == 2
    assert geo["carousel"] == 1


def test_content_ideation_iterations_default_one() -> None:
    assert resolve_content_ideation_iterations("starter") == 1
    assert resolve_content_ideation_iterations("growth") == 1


def test_content_ideation_timeouts_scale_with_package() -> None:
    from app.services.package_weekly_geometry import (
        resolve_content_ideation_agent_timeout_seconds,
        resolve_content_ideation_executor_timeout_seconds,
    )

    assert resolve_content_ideation_agent_timeout_seconds(15) >= 420
    assert resolve_content_ideation_executor_timeout_seconds(15, 1) >= 600
