"""P2-1 — Production profile tier (parity with apps/web production-profile.ts)."""

from __future__ import annotations

GIS_PROPOSE_THRESHOLD = 70


def resolve_production_profile_tier(
    package_slug: str | None = None,
    gis_score: int | None = None,
    *,
    profile_tier_override: str | None = None,
) -> str:
    slug = (package_slug or "").strip().lower()
    if profile_tier_override in ("economy", "agency", "premium"):
        tier = profile_tier_override
    elif slug in ("starter", "studio"):
        tier = "economy"
    elif slug in ("growth", "agency"):
        tier = "agency"
    elif slug in ("performance", "premium", "signature", "executive", "collective"):
        tier = "premium"
    else:
        tier = "agency"

    if gis_score is not None and gis_score < GIS_PROPOSE_THRESHOLD:
        tier = "economy"
    return tier


def blocks_fd_fallback(tier: str | None) -> bool:
    return (tier or "").strip().lower() in ("economy", "premium")
