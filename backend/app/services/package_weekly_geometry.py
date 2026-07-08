"""Weekly mission slot geometry by subscription plan (parity with package-weekly-geometry.ts)."""

from __future__ import annotations

STARTER_WEEKLY_GEOMETRY: dict[str, int] = {
    "post": 4,
    "story": 3,
    "carousel": 1,
    "reel": 4,
    "total": 12,
}

AGENCY_WEEKLY_GEOMETRY: dict[str, int] = {
    "post": 6,
    "story": 3,
    "carousel": 1,
    "reel": 6,
    "total": 16,
}


def _normalize_plan_slug(package_slug: str | None) -> str:
    return str(package_slug or "").strip().lower()


def is_starter_plan_slug(package_slug: str | None) -> bool:
    slug = _normalize_plan_slug(package_slug)
    return slug in {"starter", "studio"}


def resolve_weekly_package_geometry(package_slug: str | None = None) -> dict[str, int]:
    if is_starter_plan_slug(package_slug):
        return dict(STARTER_WEEKLY_GEOMETRY)
    return dict(AGENCY_WEEKLY_GEOMETRY)


def resolve_content_ideation_iterations(package_slug: str | None = None) -> int:
    return 1 if is_starter_plan_slug(package_slug) else 2


def resolve_content_ideation_agent_timeout_seconds(count: int) -> int:
    """Per kickoff() run — scales with weekly slot count (16-slot agency needs >180s)."""
    from app.config import get_settings

    settings = get_settings()
    floor = int(settings.crewai_content_agent_max_execution_seconds)
    scaled = 120 + max(1, int(count)) * 20
    return min(max(floor, scaled), 720)


def resolve_content_ideation_executor_timeout_seconds(count: int, iterations: int) -> int:
    """asyncio.wait_for cap for full content_ideation (all iterations + quality gate)."""
    from app.config import get_settings

    settings = get_settings()
    per_run = resolve_content_ideation_agent_timeout_seconds(count)
    total = per_run * max(1, int(iterations)) + 180
    floor = int(settings.crew_execution_timeout_seconds)
    return min(max(floor, total), 1200)


def format_mix_label(geometry: dict[str, int]) -> str:
    return (
        f"{geometry['story']} story, {geometry['post']} post, "
        f"{geometry['carousel']} carousel, {geometry['reel']} reel — "
        "her biri benzersiz caption/hashtag"
    )
