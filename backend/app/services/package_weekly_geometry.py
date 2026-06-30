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


def format_mix_label(geometry: dict[str, int]) -> str:
    return (
        f"{geometry['story']} story, {geometry['post']} post, "
        f"{geometry['carousel']} carousel, {geometry['reel']} reel — "
        "her biri benzersiz caption/hashtag"
    )
