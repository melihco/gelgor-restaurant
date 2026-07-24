"""Unit tests for platform workspace bootstrap helpers."""

from __future__ import annotations

from app.services.platform_bootstrap import _normalize_sector


def test_normalize_sector_from_business_type():
    assert _normalize_sector("restaurant_cafe") == "restaurant_cafe"
    assert _normalize_sector("Beach Club") == "beach_club"


def test_normalize_sector_empty():
    assert _normalize_sector(None) is None
    assert _normalize_sector("  ") is None
