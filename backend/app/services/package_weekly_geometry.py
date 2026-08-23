"""Weekly mission slot geometry by subscription plan (parity with package-weekly-geometry.ts)."""

from __future__ import annotations

# Keep in sync with apps/web/src/lib/package-weekly-geometry.ts
# The extra deliverable is a post, not a reel: reels are the most expensive slot
# and the one that stalls on fal quota, so widening the package there would add
# cost without adding published output.
STARTER_WEEKLY_GEOMETRY: dict[str, int] = {
    "post": 5,
    "story": 8,
    "carousel": 1,
    "reel": 2,
    "total": 16,
}

AGENCY_WEEKLY_GEOMETRY: dict[str, int] = {
    "post": 5,
    "story": 8,
    "carousel": 1,
    "reel": 2,
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


WEEKLY_FORMATS: tuple[str, ...] = ("post", "story", "carousel", "reel")


def redistribute_geometry_to_open_formats(
    geometry: dict[str, int],
    open_formats: set[str] | frozenset[str] | None,
) -> dict[str, int]:
    """
    Move the quota of formats a brand cannot publish onto the ones it can.

    Production drops any idea whose format has no enabled catalog slot, so
    asking for a closed format spends an ideation call on something that is
    thrown away *and* shrinks the package by exactly that many deliverables.
    Live, twelve of thirteen tenants have no reel slot, so every mission
    ordered two reels it could never ship.

    An unknown catalog (empty input) keeps the package as-is: better to ask for
    a format that may be dropped than to starve the mission on a read failure.
    """
    total = int(geometry.get("total") or sum(int(geometry.get(f, 0)) for f in WEEKLY_FORMATS))
    if not open_formats:
        return dict(geometry)
    open_list = [f for f in WEEKLY_FORMATS if f in open_formats]
    if not open_list or len(open_list) == len(WEEKLY_FORMATS):
        return dict(geometry)

    base = {f: int(geometry.get(f, 0)) for f in open_list}
    surplus = total - sum(base.values())
    if surplus > 0:
        weight_total = sum(base.values())
        if weight_total <= 0:
            # No open format carries a quota — split the package evenly.
            for i, f in enumerate(open_list):
                base[f] = surplus // len(open_list) + (1 if i < surplus % len(open_list) else 0)
        else:
            shares = {f: surplus * base[f] / weight_total for f in open_list}
            add = {f: int(shares[f]) for f in open_list}
            # Largest remainder, so the reshaped mix still sums to the package.
            leftover = surplus - sum(add.values())
            for f in sorted(open_list, key=lambda k: (shares[k] - add[k], base[k]), reverse=True)[:leftover]:
                add[f] += 1
            for f in open_list:
                base[f] += add[f]

    out = {f: base.get(f, 0) for f in WEEKLY_FORMATS}
    out["total"] = sum(out[f] for f in WEEKLY_FORMATS)
    return out


def resolve_content_ideation_iterations(package_slug: str | None = None) -> int:
    """
    Ideation A/B passes. Default 1 for all plans (cost-safe).
    Opt into 2 only via CREWAI_CONTENT_ITERATIONS=2 — package slug no longer forces 2×.
    """
    from app.config import get_settings

    configured = max(1, min(2, int(get_settings().crewai_content_iterations)))
    return configured


def resolve_content_ideation_agent_timeout_seconds(count: int) -> int:
    """Per kickoff() run — scales with weekly slot count."""
    from app.config import get_settings

    settings = get_settings()
    floor = int(settings.crewai_content_agent_max_execution_seconds)
    scaled = 120 + max(1, int(count)) * 20
    return min(max(floor, scaled), 720)


#: Top-up passes `_ensure_distinct_ideation_batch` may spend to fill the package.
CONTENT_IDEATION_MAX_TOPUPS = 4


def resolve_content_ideation_executor_timeout_seconds(count: int, iterations: int) -> int:
    """asyncio.wait_for cap for full content_ideation (all iterations + quality gate)."""
    from app.config import get_settings

    settings = get_settings()
    per_run = resolve_content_ideation_agent_timeout_seconds(count)
    # Top-ups run inside this window and each is its own kickoff. Without room for
    # them the node times out mid-fill and retries with a single iteration, which
    # is exactly when the package ends up short. Gaps are small, so budget them at
    # a third of a full run each.
    topup_budget = (per_run // 3) * CONTENT_IDEATION_MAX_TOPUPS
    total = per_run * max(1, int(iterations)) + topup_budget + 180
    floor = int(settings.crew_execution_timeout_seconds)
    return min(max(floor, total), 1800)


def format_mix_label(geometry: dict[str, int]) -> str:
    return (
        f"{geometry['story']} story, {geometry['post']} post, "
        f"{geometry['carousel']} carousel, {geometry['reel']} reel — "
        "her biri benzersiz caption/hashtag"
    )
