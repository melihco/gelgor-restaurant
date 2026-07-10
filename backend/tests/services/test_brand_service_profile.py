"""Tests for brand_service_profile_service — deterministic paths only (no LLM)."""

import json

from app.services.brand_service_profile_service import (
    PROFILE_VERSION,
    VALID_CTA_STYLES,
    VALID_SEASONALITY,
    build_service_profile_prompt,
    canonical_sector_from_category,
    context_updates_from_service_profile,
    heuristic_service_profile,
    merge_service_profile,
    reconcile_cta_with_category,
    _normalize_profile,
)


def test_heuristic_classifies_beach_club_from_discovery_text():
    """A Yula-like beach bar must NOT stay 'local_products_shop'."""
    ctx = {
        "business_name": "Yula Bodrum",
        "business_type": "local_products_shop",  # wrong stored classification
        "description": "Drink & Chill — Gordon's Gin, Passion Fruit, Taze Bodrum Mandalinası, kokteyl",
        "website_summary": "Yula Bodrum - Drink & Chill. Beach club sahilde kokteyl ve şarap.",
        "gallery_analysis": json.dumps({
            "u1": {"contentTags": ["cocktail", "kokteyl", "rosé wine"]},
            "u2": {"contentTags": ["beach", "deniz", "paddleboard"]},
        }),
    }
    profile = heuristic_service_profile(ctx)
    assert profile["category"] == "beach_club_bar"
    assert profile["cta_style"] == "reservation"
    assert profile["seasonality"] == "summer"
    assert profile["source"] == "heuristic"
    assert profile["version"] == PROFILE_VERSION
    # reservation venues must not get an e-commerce CTA
    assert "Rezervasyon Yap" in profile["primary_ctas"]


def test_heuristic_falls_back_to_business_type_when_no_signal():
    ctx = {"business_name": "Acme", "business_type": "consulting_firm", "description": "B2B advisory"}
    profile = heuristic_service_profile(ctx)
    assert profile["category"] == "consulting_firm"
    assert profile["cta_style"] in VALID_CTA_STYLES
    assert profile["seasonality"] in VALID_SEASONALITY


def test_normalize_coerces_invalid_values():
    profile = _normalize_profile({
        "category": "  cafe_bakery  ",
        "category_confidence": 9.0,        # out of range → clamp to 1.0
        "cta_style": "nonsense",           # invalid → contact
        "seasonality": "spring",           # invalid → year_round
        "signature_offerings": ["a", "a", "b"],  # dedupe
        "primary_ctas": [],
        "value_props": None,
        "content_guardrails": ["no kids content"],
    })
    assert profile["category"] == "cafe_bakery"
    assert profile["category_confidence"] == 1.0
    assert profile["cta_style"] == "contact"
    assert profile["seasonality"] == "year_round"
    assert profile["signature_offerings"] == ["a", "b"]
    assert profile["primary_ctas"]  # falls back to preset for contact
    assert profile["content_guardrails"] == ["no kids content"]


def test_build_prompt_block_includes_category_and_guardrails():
    profile = {
        "category": "beach_club_bar",
        "category_confidence": 0.9,
        "signature_offerings": ["imza kokteyller", "rosé şarap"],
        "cta_style": "reservation",
        "primary_ctas": ["Rezervasyon Yap"],
        "seasonality": "summer",
        "value_props": ["deniz kenarı"],
        "content_guardrails": ["çocuk içeriği üretme"],
        "source": "heuristic",
        "version": 1,
    }
    block = build_service_profile_prompt(profile)
    text = "\n".join(block)
    assert "beach_club_bar" in text
    assert "reservation" in text
    assert "Rezervasyon Yap" in text
    assert "summer" in text
    assert "çocuk içeriği üretme" in text
    assert "authoritative" in text.lower()


def test_build_prompt_block_empty_for_missing_profile():
    assert build_service_profile_prompt(None) == []
    assert build_service_profile_prompt({}) == []
    assert build_service_profile_prompt({"category": ""}) == []


def test_canonical_sector_maps_beach_club_bar():
    assert canonical_sector_from_category("beach_club_bar") == "beach_club"
    assert canonical_sector_from_category("restaurant_bar") == "restaurant_cafe"


def test_reconcile_repairs_cta_style_disagreeing_with_category():
    """An LLM result naming the right category but a wrong cta_style must be repaired.

    Mirrors the Yula record where category=restaurant_bar but cta_style=visit produced
    e-commerce CTAs for a beach bar.
    """
    profile = reconcile_cta_with_category({
        "category": "restaurant_bar",
        "cta_style": "visit",  # wrong — must become reservation
        "primary_ctas": ["Bizi Ziyaret Et", "Hemen İncele"],
    })
    assert profile["cta_style"] == "reservation"
    assert "Rezervasyon Yap" in profile["primary_ctas"]
    assert "Hemen İncele" not in profile["primary_ctas"]


def test_reconcile_forces_reservation_for_beach_club_bar():
    profile = reconcile_cta_with_category({"category": "beach_club_bar", "cta_style": "ecommerce"})
    assert profile["cta_style"] == "reservation"
    assert "Rezervasyon Yap" in profile["primary_ctas"]


def test_reconcile_leaves_consistent_and_unknown_categories_untouched():
    consistent = reconcile_cta_with_category({"category": "restaurant_bar", "cta_style": "reservation", "primary_ctas": ["Masanı Ayır"]})
    assert consistent["cta_style"] == "reservation"
    assert consistent["primary_ctas"] == ["Masanı Ayır"]  # not clobbered when already correct

    unknown = reconcile_cta_with_category({"category": "general_business", "cta_style": "contact"})
    assert unknown["cta_style"] == "contact"


def test_merge_preserves_guardrails_and_offerings_when_incoming_lists_empty():
    existing = {
        "category": "beach_club_bar",
        "category_confidence": 0.85,
        "signature_offerings": ["imza kokteyller", "rosé şarap", "gün batımı DJ setleri"],
        "cta_style": "reservation",
        "primary_ctas": ["Rezervasyon Yap", "Masanı Ayır"],
        "seasonality": "summer",
        "value_props": ["deniz kenarı atmosfer"],
        "content_guardrails": ["çocuk içeriği üretme", "e-ticaret CTA kullanma"],
        "source": "onboarding_llm",
        "version": PROFILE_VERSION,
    }
    incoming = heuristic_service_profile({
        "business_name": "Yula Bodrum",
        "business_type": "beach_club",
        "description": "Drink & Chill beach club kokteyl",
        "website_summary": "Beach club sahilde kokteyl ve şarap.",
    })
    assert incoming["signature_offerings"] == []
    assert incoming["content_guardrails"] == []

    merged = merge_service_profile(existing, incoming)
    assert merged["category"] == "beach_club_bar"
    assert merged["signature_offerings"] == existing["signature_offerings"]
    assert merged["content_guardrails"] == existing["content_guardrails"]
    assert merged["value_props"] == existing["value_props"]
    assert merged["category_confidence"] == 0.85


def test_context_updates_sync_business_type_and_turkish_ctas():
    profile = heuristic_service_profile({
        "business_name": "Yula Bodrum",
        "business_type": "local_products_shop",
        "description": "Drink & Chill beach club kokteyl",
        "website_summary": "Beach club sahilde kokteyl ve şarap.",
    })
    updates = context_updates_from_service_profile(profile)
    assert updates["business_type"] == "beach_club"
    ctas = json.loads(updates["default_ctas"])
    assert "Rezervasyon Yap" in ctas
