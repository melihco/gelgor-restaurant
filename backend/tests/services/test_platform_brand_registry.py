"""Unit tests for platform brand registry helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.platform_brand_registry import (
    brand_row_matches_filters,
    resolve_brand_sector_id,
    serialize_brand_registry_row,
)


def _ctx(**overrides):
    base = dict(
        workspace_id=uuid4(),
        business_name="Gel Gör",
        business_type="restaurant_cafe",
        brand_service_profile={"category": "restaurant_cafe"},
        location="İstanbul",
        instagram_handle="gel_gor",
        website_url="https://example.com",
        languages="tr",
        brand_tone="samimi",
        updated_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_resolve_brand_sector_from_profile_category():
    ctx = _ctx(brand_service_profile={"category": "beach_club"})
    assert resolve_brand_sector_id(ctx) == "beach_club"


def test_resolve_brand_sector_falls_back_to_business_type():
    ctx = _ctx(brand_service_profile=None, business_type="local_products_shop")
    assert resolve_brand_sector_id(ctx) == "local_products_shop"


def test_serialize_brand_registry_row():
    ctx = _ctx()
    row = serialize_brand_registry_row(ctx)
    assert row["business_name"] == "Gel Gör"
    assert row["sector_id"] == "restaurant_cafe"
    assert row["instagram_handle"] == "gel_gor"


def test_brand_row_matches_filters_sector_and_query():
    row = {
        "workspace_id": "0466adb9-1111-2222-3333-444444444444",
        "business_name": "Gel Gör",
        "business_type": "restaurant_cafe",
        "sector_id": "restaurant_cafe",
        "instagram_handle": "gel_gor",
        "location": "İstanbul",
    }
    assert brand_row_matches_filters(row, sector_id="restaurant_cafe") is True
    assert brand_row_matches_filters(row, sector_id="beach_club") is False
    assert brand_row_matches_filters(row, q="gel") is True
    assert brand_row_matches_filters(row, q="0466adb9") is True
    assert brand_row_matches_filters(row, q="sarnic") is False
