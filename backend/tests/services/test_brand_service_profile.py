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
    assert canonical_sector_from_category("barber_salon") == "barber_salon"


def test_heuristic_classifies_mens_barber_franchise_not_beauty_spa():
    """Multi-location erkek kuaför discovery must land on barber_salon, not beauty spa."""
    ctx = {
        "business_name": "Kadir Alkan",
        "business_type": "general_business",
        "website_url": "https://www.kadiralkan.com.tr/salonlar/",
        "description": "Erkek kuaför salonları — saç kesim ve tıraş",
        "website_summary": (
            "Erkek Kuaför Salonlar - Kadir Alkan. Ankara Antalya İstanbul İzmir "
            "erkek kuaför ve berber ağı. Saç kesim, tıraş."
        ),
        "instagram_bio": "erkek kuaför · saç kesim",
        "gallery_analysis": json.dumps({
            "u1": {"contentTags": ["hair salon", "styling station", "mirror"]},
        }),
    }
    profile = heuristic_service_profile(ctx)
    assert profile["category"] == "barber_salon"
    assert profile["cta_style"] == "booking"
    updates = context_updates_from_service_profile(profile, languages="tr")
    assert updates["business_type"] == "barber_salon"


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


def test_merge_manual_override_locks_category_but_allows_enrich():
    """BrandConfirm sector must survive finalize/bootstrap re-derive."""
    existing = {
        "category": "barber_salon",
        "category_confidence": 1.0,
        "signature_offerings": [],
        "cta_style": "booking",
        "primary_ctas": ["Randevu Al"],
        "seasonality": "year_round",
        "value_props": [],
        "content_guardrails": [],
        "source": "manual_override",
        "version": PROFILE_VERSION,
    }
    # Derive wrongly wants beauty_wellness (old kuaför→beauty bias).
    incoming = _normalize_profile({
        "category": "beauty_wellness",
        "category_confidence": 0.9,
        "signature_offerings": ["saç kesim", "tıraş", "sakal şekillendirme"],
        "cta_style": "booking",
        "primary_ctas": ["Randevu Al", "Yerini Ayır"],
        "seasonality": "year_round",
        "value_props": ["çok lokasyonlu erkek kuaför ağı"],
        "content_guardrails": ["nail/spa içeriği üretme"],
        "source": "onboarding_llm",
    })

    merged = merge_service_profile(existing, incoming)
    assert merged["category"] == "barber_salon"
    assert merged["source"] == "manual_override"
    assert merged["category_confidence"] == 1.0
    # Enrich empty lists from derive
    assert merged["signature_offerings"] == ["saç kesim", "tıraş", "sakal şekillendirme"]
    assert merged["content_guardrails"] == ["nail/spa içeriği üretme"]
    assert merged["cta_style"] == "booking"
    updates = context_updates_from_service_profile(merged, languages="tr")
    assert updates["business_type"] == "barber_salon"


def test_context_updates_sync_business_type_and_turkish_ctas():
    profile = heuristic_service_profile({
        "business_name": "Yula Bodrum",
        "business_type": "local_products_shop",
        "description": "Drink & Chill beach club kokteyl",
        "website_summary": "Beach club sahilde kokteyl ve şarap.",
    })
    updates = context_updates_from_service_profile(profile, languages="tr")
    assert updates["business_type"] == "beach_club"
    ctas = json.loads(updates["default_ctas"])
    assert "Rezervasyon Yap" in ctas


def test_context_updates_write_english_ctas_for_en_brands():
    profile = heuristic_service_profile({
        "business_name": "Coastal Beach Club",
        "business_type": "beach_club",
        "description": "beach club hospitality cocktails",
        "website_summary": "Beach club by the sea with cocktails and sunset.",
    })
    updates = context_updates_from_service_profile(profile, languages="en")
    ctas = json.loads(updates["default_ctas"])
    blob = " ".join(ctas).lower()
    assert "book now" in blob or "reserve a table" in blob
    assert "rezervasyon" not in blob
    assert "masanı" not in blob and "masani" not in blob
