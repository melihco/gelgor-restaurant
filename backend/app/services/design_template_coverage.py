"""
Fal brand_design_templates type coverage — sector policy (mirrors TS design-template-type-policy).
"""

from __future__ import annotations

from typing import Any

_HOSPITALITY_BUCKETS: dict[str, tuple[str, ...]] = {
    "event": ("event_special", "campaign_announcement"),
    "menu": ("menu_highlight", "seasonal_promo"),
    "atmosphere": ("venue_showcase", "daily_story", "reel_cover", "brand_identity"),
}

_LOCAL_PRODUCT_MARKERS = (
    "local_product",
    "ecommerce_retail",
    "gourmet",
    "retail",
)
_HOSPITALITY_MARKERS = (
    "beach",
    "hotel",
    "resort",
    "restaurant",
    "cafe",
    "nightlife",
    "pub",
    "bar",
    "club",
    "marina",
)


def _norm_sector(sector: str | None) -> str:
    return (sector or "").strip().lower().replace(" ", "_").replace("-", "_")


def resolve_type_policy(sector: str | None) -> dict[str, Any]:
    sid = _norm_sector(sector)
    if any(m in sid for m in _LOCAL_PRODUCT_MARKERS):
        return {
            "sector_id": sid,
            "min_distinct_types": 6,
            "min_hospitality_buckets": None,
            "family": "local_products",
        }
    if any(m in sid for m in _HOSPITALITY_MARKERS):
        return {
            "sector_id": sid,
            "min_distinct_types": 5,
            "min_hospitality_buckets": 3,
            "family": "hospitality",
        }
    return {
        "sector_id": sid or "general",
        "min_distinct_types": 5,
        "min_hospitality_buckets": None,
        "family": "general",
    }


def summarize_template_type_coverage(
    templates: list[Any],
    sector: str | None,
) -> dict[str, Any]:
    policy = resolve_type_policy(sector)
    types: set[str] = set()
    keyed = 0
    active_n = 0
    for t in templates:
        status = str(getattr(t, "status", None) or "active").lower()
        if status == "archived":
            continue
        active_n += 1
        tt = str(getattr(t, "template_type", None) or "").strip().lower()
        if tt:
            types.add(tt)
        key = str(getattr(t, "catalog_slot_key", None) or "").strip()
        if key:
            keyed += 1

    buckets = [
        name
        for name, members in _HOSPITALITY_BUCKETS.items()
        if any(m in types for m in members)
    ]
    min_types = int(policy["min_distinct_types"])
    min_buckets = policy["min_hospitality_buckets"]
    types_ok = len(types) >= min_types
    buckets_ok = min_buckets is None or len(buckets) >= int(min_buckets)
    sufficient = active_n > 0 and types_ok and buckets_ok

    return {
        "active_count": active_n,
        "keyed_count": keyed,
        "distinct_types": sorted(types),
        "type_count": len(types),
        "min_distinct_types": min_types,
        "hospitality_buckets": buckets,
        "min_hospitality_buckets": min_buckets,
        "family": policy["family"],
        "sufficient": sufficient,
    }
