"""Tests for plan-aware weekly package geometry."""

from app.services.package_weekly_geometry import (
    resolve_content_ideation_iterations,
    resolve_weekly_package_geometry,
)


def test_starter_geometry() -> None:
    geo = resolve_weekly_package_geometry("starter")
    assert geo["total"] == 16
    assert geo == {"post": 5, "story": 8, "carousel": 1, "reel": 2, "total": 16}


def test_agency_geometry_matches_mix() -> None:
    geo = resolve_weekly_package_geometry("growth")
    assert geo["total"] == 16
    assert geo["post"] == 5
    assert geo["story"] == 8
    # Widening the package must not add reels: they cost the most and stall on
    # provider quota, so extra reel slots buy spend rather than published posts.
    assert geo["reel"] == 2
    assert geo["carousel"] == 1


def test_geometry_total_matches_its_own_mix() -> None:
    for slug in ("starter", "growth", None):
        geo = resolve_weekly_package_geometry(slug)
        assert geo["total"] == geo["post"] + geo["story"] + geo["carousel"] + geo["reel"]


def test_content_ideation_iterations_default_one() -> None:
    assert resolve_content_ideation_iterations("starter") == 1
    assert resolve_content_ideation_iterations("growth") == 1


def test_content_ideation_timeouts_scale_with_package() -> None:
    from app.services.package_weekly_geometry import (
        resolve_content_ideation_agent_timeout_seconds,
        resolve_content_ideation_executor_timeout_seconds,
    )

    assert resolve_content_ideation_agent_timeout_seconds(16) >= 420
    assert resolve_content_ideation_executor_timeout_seconds(16, 1) >= 600


def test_executor_timeout_budgets_the_topup_passes() -> None:
    """Top-ups run inside this window; without room the node times out mid-fill."""
    from app.services.package_weekly_geometry import (
        CONTENT_IDEATION_MAX_TOPUPS,
        resolve_content_ideation_agent_timeout_seconds,
        resolve_content_ideation_executor_timeout_seconds,
    )

    per_run = resolve_content_ideation_agent_timeout_seconds(16)
    total = resolve_content_ideation_executor_timeout_seconds(16, 1)
    assert total >= per_run + (per_run // 3) * CONTENT_IDEATION_MAX_TOPUPS
