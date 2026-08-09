from types import SimpleNamespace

from app.services.design_template_coverage import (
    resolve_type_policy,
    summarize_template_type_coverage,
)
from app.services.tenant_hygiene import is_active_production_tenant, is_stub_business_name


def test_local_products_policy_requires_six_types() -> None:
    p = resolve_type_policy("local_products_shop")
    assert p["min_distinct_types"] == 6
    assert p["family"] == "local_products"


def test_hospitality_policy_requires_bucket_balance() -> None:
    p = resolve_type_policy("beach_club")
    assert p["min_distinct_types"] == 5
    assert p["min_hospitality_buckets"] == 3


def test_coverage_fails_when_types_narrow() -> None:
    rows = [
        SimpleNamespace(status="active", template_type="campaign_announcement", catalog_slot_key="a"),
        SimpleNamespace(status="active", template_type="campaign_announcement", catalog_slot_key="b"),
        SimpleNamespace(status="active", template_type="seasonal_promo", catalog_slot_key=None),
    ]
    stats = summarize_template_type_coverage(rows, "local_products_shop")
    assert stats["type_count"] == 2
    assert stats["sufficient"] is False


def test_hospitality_coverage_needs_three_buckets() -> None:
    rows = [
        SimpleNamespace(status="active", template_type="event_special", catalog_slot_key="e1"),
        SimpleNamespace(status="active", template_type="menu_highlight", catalog_slot_key="m1"),
        SimpleNamespace(status="active", template_type="venue_showcase", catalog_slot_key="v1"),
        SimpleNamespace(status="active", template_type="daily_story", catalog_slot_key="d1"),
        SimpleNamespace(status="active", template_type="reel_cover", catalog_slot_key="r1"),
    ]
    stats = summarize_template_type_coverage(rows, "beach_club")
    assert stats["sufficient"] is True
    assert set(stats["hospitality_buckets"]) == {"event", "menu", "atmosphere"}


def test_tenant_hygiene_blocks_stubs_and_unconfirmed() -> None:
    assert is_stub_business_name("Brand")
    assert is_stub_business_name("Nexus Tenant")
    stub = SimpleNamespace(business_name="Brand", brand_constitution_confirmed_at="2026-01-01")
    assert is_active_production_tenant(stub) is False
    unconfirmed = SimpleNamespace(business_name="Karaman Datça", brand_constitution_confirmed_at=None)
    assert is_active_production_tenant(unconfirmed) is False
    active = SimpleNamespace(
        business_name="Karaman Datça",
        brand_constitution_confirmed_at="2026-08-01T00:00:00Z",
    )
    assert is_active_production_tenant(active) is True
