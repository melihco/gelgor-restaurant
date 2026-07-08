"""Tests for plan-aware weekly package geometry."""

from app.services.package_weekly_geometry import (
    resolve_content_ideation_iterations,
    resolve_weekly_package_geometry,
)


def test_starter_geometry() -> None:
    geo = resolve_weekly_package_geometry("starter")
    assert geo["total"] == 12
    assert geo == {"post": 4, "story": 3, "carousel": 1, "reel": 4, "total": 12}


def test_agency_geometry_default() -> None:
    geo = resolve_weekly_package_geometry("growth")
    assert geo["total"] == 16
    assert geo["post"] == 6
    assert geo["reel"] == 6
    assert geo["story"] == 3


def test_content_ideation_iterations_by_plan() -> None:
    assert resolve_content_ideation_iterations("starter") == 1
    assert resolve_content_ideation_iterations("growth") == 2


def test_content_ideation_timeouts_scale_with_package() -> None:
    from app.services.package_weekly_geometry import (
        resolve_content_ideation_agent_timeout_seconds,
        resolve_content_ideation_executor_timeout_seconds,
    )

    assert resolve_content_ideation_agent_timeout_seconds(16) >= 440
    assert resolve_content_ideation_agent_timeout_seconds(12) >= 360
    assert resolve_content_ideation_executor_timeout_seconds(16, 2) >= 1060
    assert resolve_content_ideation_executor_timeout_seconds(16, 1) >= 620
