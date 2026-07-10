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
