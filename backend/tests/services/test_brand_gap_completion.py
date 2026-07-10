"""Tests for brand gap detection — multi-sector."""
from types import SimpleNamespace

from app.services.brand_gap_completion_service import (
    detect_brand_gaps,
    is_corrupted_description,
    repair_description_from_discovery,
)


def _ctx(**kwargs):
    defaults = {
        "description": "Bodrum Bitez sahil kulübü — yaz sezonu deneyimi.",
        "website_summary": "",
        "visual_dna": "Mood: warm coastal premium beach club aesthetic with sun-bleached sand tones and Aegean teal accents for agent prompts.",
        "brand_dna": '{"data_richness": "rich"}',
        "business_type": "beach_club",
        "brand_service_profile": {"category": "beach_club_bar"},
        "content_pillars": '["daily_story", "menu_share"]',
        "default_ctas": '["Rezervasyon Yap"]',
        "discovery_confidence": 75,
        "industry_calendar": '{"industry_type": "beach_club"}',
        "brand_theme": {"palette": {"primary": "#264653"}, "template_library": {"locked": True, "slots": [1, 2, 3, 4, 5]}},
        "brand_vibe_profile": {"palette": {}},
        "reference_image_urls": '["https://cdn.example/a.jpg"]',
        "gallery_analysis": '{"https://cdn.example/a.jpg": {"tags": ["pool"]}}',
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_corrupted_description_detected():
    assert is_corrupted_description("Brand — local service business sektöründe hizmet vermektedir.")
    assert not is_corrupted_description("Sarnıç Beach — Bitez koyunda premium beach club deneyimi.")


def test_repair_description_from_website_summary():
    ctx = _ctx(
        description="Brand — local service business sektöründe hizmet vermektedir.",
        website_summary="Anasayfa - Sarnıç Beach\nBodrum Bitez sahil kulübü 1993'ten beri hizmet veriyor.",
    )
    fixed = repair_description_from_discovery(ctx)
    assert fixed is not None
    assert "Bodrum Bitez" in fixed
    assert "local service" not in fixed.lower()


def test_detect_gaps_beach_club_minimal():
    ctx = _ctx()
    gaps = detect_brand_gaps(ctx)
    ids = {g["id"] for g in gaps}
    assert "description_corrupt" not in ids
    assert "visual_dna_missing" not in ids


def test_detect_gaps_local_products_shop():
    ctx = _ctx(
        business_type="local_products_shop",
        brand_service_profile={"category": "local_products_shop"},
        description="",
        visual_dna="",
        brand_dna=None,
        industry_calendar=None,
        brand_theme=None,
        content_pillars="[]",
        default_ctas="[]",
        discovery_confidence=50,
        reference_image_urls="[]",
        gallery_analysis="{}",
    )
    gaps = detect_brand_gaps(ctx)
    ids = {g["id"] for g in gaps}
    assert "description_corrupt" in ids
    assert "visual_dna_missing" in ids
    assert "brand_dna_sparse" in ids
    assert "content_pillars_low" in ids
