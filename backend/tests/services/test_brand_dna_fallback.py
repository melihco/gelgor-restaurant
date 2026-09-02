"""
Brand DNA must never present a failed synthesis as brand intelligence.

Three live tenants across three sectors were all carrying the identical
placeholder DNA ("Local competitor", "Quality", "Consistent brand presence")
because a Sunday refresh that could not reach the synthesiser overwrote the real
document with the fallback. These tests pin both halves of the fix: the fallback
stops fabricating strategic fields, and a fallback can never replace a
synthesised document.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.crew.context import BrandInfo
from app.services.brand_dna_service import (
    brand_dna_quality_rank,
    build_brand_dna_prompt,
    is_fallback_brand_dna,
    resolve_brand_dna_for_persist,
    _minimal_dna,
)

NOW = datetime(2026, 9, 2, 20, 0, tzinfo=timezone.utc)

# The exact document the three live tenants were carrying.
LEGACY_PLACEHOLDER_DNA = {
    "brand_essence": "KARAMAN DATÇA — local_products_shop in Datça",
    "proven_content_patterns": ["Authentic venue photography", "Local audience focus"],
    "audience_intelligence": {
        "primary": "mevcut müşteriler, potansiyel müşteriler, yerel takipçiler",
        "what_they_want": "Quality experience",
        "what_triggers_them": "Social proof and visual appeal",
    },
    "competitive_position": "Local competitor",
    "content_do_list": ["Use real venue photos", "Include clear CTA"],
    "content_dont_list": ["Generic stock imagery"],
    "current_strategic_priority": "Consistent brand presence",
    "customer_intelligence": {"what_they_love": "Quality", "pain_points_to_address": ""},
    "sales_strategy_context": "Build awareness and drive conversions",
    "agency_recommendation": "Run brand analysis first to get tailored recommendations",
    "data_richness": "sparse",
}

SYNTHESISED_DNA = {
    "brand_essence": (
        "Datça'da kendi zeytinyağı fabrikası olan, nesillerdir aynı bahçeleri işleyen "
        "yöresel ürün markası."
    ),
    "competitive_position": (
        "Datça'da tek dikey entegre üretici — rakipler perakendeci, bunlar kendi sıkıyor."
    ),
    "current_strategic_priority": "Erken hasat zeytinyağı sezonunu Ballı Badem ile paketlemek",
    "agency_recommendation": "Kendi fabrikanızı içerik kahramanı yapın",
    "data_richness": "rich",
    "synthesis_status": "synthesised",
}


def _brand(business_type: str, name: str) -> BrandInfo:
    return BrandInfo(
        business_name=name,
        business_type=business_type,
        location="Datça",
        target_audience="Datça'ya gelen turistler",
        brand_tone="Authentic, Warm, Trustworthy",
    )


class TestFallbackStopsFabricating:
    def test_local_products_shop_fallback_omits_strategic_fields(self):
        dna = _minimal_dna(_brand("local_products_shop", "Karaman Datça"), NOW, reason="no_api_key")

        # These were the fabricated fields — they must simply not be there.
        for field in (
            "competitive_position",
            "current_strategic_priority",
            "customer_intelligence",
            "sales_strategy_context",
            "agency_recommendation",
            "proven_content_patterns",
            "content_do_list",
        ):
            assert field not in dna, f"{field} must not be fabricated in a fallback DNA"

        assert dna["synthesis_status"] == "fallback"
        assert dna["fallback_reason"] == "no_api_key"

    def test_beach_club_fallback_keeps_only_recorded_values(self):
        brand = _brand("beach_club", "Sarnıç Beach")
        dna = _minimal_dna(brand, NOW, reason="synthesis_unavailable")

        # What survives must be traceable to a real brand field.
        assert brand.business_name in dna["brand_essence"]
        assert dna["audience_intelligence"]["primary"] == brand.target_audience
        assert dna["brand_voice_guide"]["tone"] == brand.brand_tone
        assert "what_they_want" not in dna["audience_intelligence"]

    def test_fallback_drops_audience_and_voice_when_brand_has_none(self):
        bare = BrandInfo(business_name="Yeni Marka", business_type="coffee_shop")
        dna = _minimal_dna(bare, NOW, reason="no_signals")

        assert "audience_intelligence" not in dna
        assert "brand_voice_guide" not in dna


class TestFallbackDetection:
    def test_detects_the_legacy_placeholder_rows_already_in_the_database(self):
        assert is_fallback_brand_dna(LEGACY_PLACEHOLDER_DNA) is True
        assert brand_dna_quality_rank(LEGACY_PLACEHOLDER_DNA) == 0

    def test_synthesised_document_is_not_a_fallback(self):
        assert is_fallback_brand_dna(SYNTHESISED_DNA) is False
        assert brand_dna_quality_rank(SYNTHESISED_DNA) == 3

    def test_empty_and_malformed_count_as_fallback(self):
        assert is_fallback_brand_dna(None) is True
        assert is_fallback_brand_dna({}) is True
        assert is_fallback_brand_dna("not a dict") is True


class TestPersistGuard:
    def test_fallback_never_replaces_a_synthesised_document(self):
        fallback = _minimal_dna(_brand("beach_club", "Sarnıç Beach"), NOW, reason="synthesis_unavailable")

        assert resolve_brand_dna_for_persist(SYNTHESISED_DNA, fallback) is None
        assert resolve_brand_dna_for_persist(json.dumps(SYNTHESISED_DNA), fallback) is None

    def test_fallback_may_replace_the_legacy_placeholder_row(self):
        # Both rank 0, so the honest fallback is allowed through — it at least
        # stops instructing agents to obey placeholder strategy.
        fallback = _minimal_dna(_brand("local_products_shop", "Karaman Datça"), NOW, reason="no_api_key")

        assert resolve_brand_dna_for_persist(LEGACY_PLACEHOLDER_DNA, fallback) == fallback

    def test_fallback_persists_when_nothing_exists_yet(self):
        fallback = _minimal_dna(_brand("restaurant_cafe", "Gel Gör Restaurant"), NOW, reason="no_signals")

        assert resolve_brand_dna_for_persist(None, fallback) == fallback
        assert resolve_brand_dna_for_persist("", fallback) == fallback

    def test_synthesised_always_replaces_whatever_is_there(self):
        assert resolve_brand_dna_for_persist(LEGACY_PLACEHOLDER_DNA, SYNTHESISED_DNA) == SYNTHESISED_DNA
        assert resolve_brand_dna_for_persist(SYNTHESISED_DNA, SYNTHESISED_DNA) == SYNTHESISED_DNA

    def test_a_moderate_refresh_does_not_downgrade_a_rich_document(self):
        moderate = {**SYNTHESISED_DNA, "data_richness": "moderate"}

        assert resolve_brand_dna_for_persist(SYNTHESISED_DNA, moderate) is None
        assert resolve_brand_dna_for_persist(moderate, SYNTHESISED_DNA) == SYNTHESISED_DNA

    def test_nothing_is_written_when_synthesis_returned_nothing(self):
        assert resolve_brand_dna_for_persist(SYNTHESISED_DNA, None) is None
        assert resolve_brand_dna_for_persist(SYNTHESISED_DNA, {}) is None


class TestPromptBlock:
    def test_fallback_prompt_does_not_claim_mandatory_brand_intelligence(self):
        fallback = _minimal_dna(_brand("restaurant_cafe", "Gel Gör Restaurant"), NOW, reason="no_api_key")
        prompt = build_brand_dna_prompt(fallback)

        assert "MANDATORY" not in prompt
        assert "NOT AVAILABLE" in prompt
        # Agents must be pushed to the concrete fields instead.
        assert "uydurma" in prompt

    def test_legacy_placeholder_row_no_longer_renders_as_strategy(self):
        prompt = build_brand_dna_prompt(LEGACY_PLACEHOLDER_DNA)

        for placeholder in (
            "Local competitor",
            "Consistent brand presence",
            "Social proof and visual appeal",
            "Run brand analysis first",
            "Use real venue photos",
        ):
            assert placeholder not in prompt, f"{placeholder!r} must not reach the prompt"

        assert "MANDATORY" not in prompt
        # The audience line the brand actually recorded should survive.
        assert "mevcut müşteriler" in prompt

    def test_synthesised_prompt_keeps_its_mandate_and_content(self):
        prompt = build_brand_dna_prompt(SYNTHESISED_DNA)

        assert "MANDATORY" in prompt
        assert "NOT AVAILABLE" not in prompt
        assert "kendi zeytinyağı fabrikası" in prompt
        assert "Ballı Badem" in prompt
