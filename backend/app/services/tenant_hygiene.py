"""
Shared tenant hygiene — which brand_contexts rows should receive intel jobs.

No UUID/brand special-casing: stub names + constitution gate only.
"""

from __future__ import annotations

from typing import Any

STUB_BUSINESS_NAMES = frozenset({
    "brand",
    "test",
    "demo",
    "unknown brand",
    "nexus tenant",
    "new brand",
})


def normalize_business_name(name: str | None) -> str:
    return " ".join(str(name or "").strip().lower().split())


def is_stub_business_name(name: str | None) -> bool:
    return normalize_business_name(name) in STUB_BUSINESS_NAMES


def is_active_production_tenant(ctx: Any, *, require_constitution: bool = True) -> bool:
    """
    True when weekly intel / DNA / competitor jobs should spend Apify/OpenAI budget.
    """
    if ctx is None:
        return False
    if is_stub_business_name(getattr(ctx, "business_name", None)):
        return False
    if require_constitution and not getattr(ctx, "brand_constitution_confirmed_at", None):
        return False
    return True
