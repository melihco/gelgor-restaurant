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


def test_closed_formats_hand_their_quota_to_open_ones() -> None:
    """Live: 12 of 13 tenants had no reel slot, so 2 ideas per mission were binned."""
    from app.services.package_weekly_geometry import (
        redistribute_geometry_to_open_formats,
    )

    geo = resolve_weekly_package_geometry(None)  # 5 post, 8 story, 1 carousel, 2 reel
    shaped = redistribute_geometry_to_open_formats(geo, {"post", "story", "carousel"})

    assert shaped["reel"] == 0
    assert shaped["total"] == geo["total"]
    assert shaped["post"] + shaped["story"] + shaped["carousel"] == geo["total"]
    # The freed quota follows the existing weighting, so story stays dominant.
    assert shaped["story"] > shaped["post"] > shaped["carousel"]


def test_reshaping_covers_a_second_sector_shape() -> None:
    from app.services.package_weekly_geometry import (
        redistribute_geometry_to_open_formats,
    )

    geo = resolve_weekly_package_geometry(None)
    # restaurant_cafe live: neither reel nor carousel enabled.
    shaped = redistribute_geometry_to_open_formats(geo, {"post", "story"})
    assert (shaped["reel"], shaped["carousel"]) == (0, 0)
    assert shaped["post"] + shaped["story"] == geo["total"]

    # A brand with every format open is left exactly as planned.
    full = redistribute_geometry_to_open_formats(
        geo, {"post", "story", "carousel", "reel"}
    )
    assert full == geo

    # An unreadable catalog must not starve the mission.
    assert redistribute_geometry_to_open_formats(geo, set()) == geo
    assert redistribute_geometry_to_open_formats(geo, None) == geo


def test_reshaping_handles_a_single_open_format() -> None:
    from app.services.package_weekly_geometry import (
        redistribute_geometry_to_open_formats,
    )

    geo = resolve_weekly_package_geometry(None)
    shaped = redistribute_geometry_to_open_formats(geo, {"story"})
    assert shaped["story"] == geo["total"]
    assert shaped["total"] == geo["total"]


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
