"""Tests for .NET ↔ Python brand context merge (content_pillars SSOT)."""

from app.crew.context import BrandInfo
from app.services.brand_context_service import merge_dotnet_brand_with_python_db


def test_merge_prefers_python_content_pillars_over_dotnet():
    base = BrandInfo(business_name="Test", business_type="restaurant_cafe")
    py = BrandInfo(
        business_name="Test",
        business_type="restaurant_cafe",
        content_pillars=["daily_story", "menu_share"],
    )
    merged = merge_dotnet_brand_with_python_db(
        base,
        py,
        dotnet_content_pillars=["lead_generation", "educational_post"],
    )
    assert merged.content_pillars == ["daily_story", "menu_share"]


def test_merge_falls_back_to_dotnet_when_python_pillars_empty():
    base = BrandInfo(business_name="Test", business_type="restaurant_cafe")
    py = BrandInfo(business_name="Test", business_type="restaurant_cafe", content_pillars=[])
    merged = merge_dotnet_brand_with_python_db(
        base,
        py,
        dotnet_content_pillars=["service_intro", "social_proof"],
    )
    assert merged.content_pillars == ["service_intro", "social_proof"]


def test_merge_copies_instagram_voice_fields_from_python_db():
    base = BrandInfo(business_name="Test", business_type="local_products_shop")
    py = BrandInfo(
        business_name="Test",
        business_type="local_products_shop",
        instagram_handle="karamandatcayoresel",
        instagram_recent_captions=["Erken hasat teneke — Datça pantri"],
        instagram_intelligence={"brand_voice": {"primary_tone": "samimi"}},
    )
    merged = merge_dotnet_brand_with_python_db(base, py)
    assert merged.instagram_handle == "karamandatcayoresel"
    assert merged.instagram_recent_captions == ["Erken hasat teneke — Datça pantri"]
    assert merged.instagram_intelligence["brand_voice"]["primary_tone"] == "samimi"
