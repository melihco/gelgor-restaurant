"""Tests for production_design_profile_service heuristic paths."""

import json

from app.services.production_design_profile_service import (
    derive_production_design_profile,
    ensure_visual_dna_palette_hex,
)


class _FakeCtx:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_heuristic_beach_club_profile_rewrites_wellness_leak():
    ctx = _FakeCtx(
        workspace_id="00000000-0000-0000-0000-000000000001",
        business_name="Scorpios Bodrum",
        business_type="beach_club",
        location="Bodrum",
        languages="en",
        brand_tone="samimi, sıcak, güvenilir",
        visual_style="energetic, vibrant",
        visual_dna="**Brand**: Scorpios\n**Mood**: sophisticated spa wellness",
        description="Beach club with dining and music",
        content_pillars=json.dumps(["service_intro", "educational_post", "social_proof"]),
        brand_service_profile={
            "category": "beach_club_bar",
            "content_guardrails": ["must not focus solely on beauty and wellness services"],
            "signature_offerings": ["sunset dining", "live music"],
        },
    )
    profile = derive_production_design_profile(ctx, openai_api_key="")
    assert profile["sector"] == "beach_club"
    assert profile["source"] == "onboarding_heuristic"
    assert "Mood:" in profile["visual_dna"]
    assert "Anti-look:" in profile["visual_dna"]
    assert "refined" in profile["brand_tone"] or "seçkin" in profile["brand_tone"]
    assert "daily_story" in profile["content_pillars"]
    assert "educational_post" not in profile["content_pillars"]


def test_heuristic_local_products_profile():
    ctx = _FakeCtx(
        workspace_id="00000000-0000-0000-0000-000000000002",
        business_name="Village Honey Co",
        business_type="local_products_shop",
        languages="tr",
        description="Organic honey and olive oil from Aegean villages",
        content_pillars="[]",
        brand_service_profile={"category": "local_products_shop"},
    )
    profile = derive_production_design_profile(ctx, openai_api_key="")
    assert profile["sector"] == "local_products_shop"
    assert "artisan" in profile["visual_dna"].lower() or "authentic" in profile["visual_dna"].lower()
    assert "product_highlight" in profile["content_pillars"]


def test_ensure_visual_dna_palette_hex_injects_brand_kit():
    dna = "\n".join([
        "Mood: coastal calm",
        "Aesthetic: beach club editorial",
        "Palette words: sand, coral, turquoise",
        "Lighting: golden hour",
    ])
    out = ensure_visual_dna_palette_hex(dna, ["#87CEEB", "#FF69B4"])
    assert "#87CEEB" in out
    assert "#FF69B4" in out
    assert "Palette words:" in out


def test_ensure_visual_dna_palette_hex_skips_when_present():
    dna = "Palette words: #112233 accent #AABBCC"
    out = ensure_visual_dna_palette_hex(dna, ["#112233"])
    assert out == dna


def test_derive_injects_palette_from_brand_kit():
    ctx = _FakeCtx(
        workspace_id="431b2901-a2dc-4df6-abe3-3670d9844851",
        business_name="Sarnic Beach",
        business_type="beach_club",
        brand_primary_color="#87CEEB",
        brand_accent_color="#FF69B4",
        brand_service_profile={"category": "beach_club_bar"},
    )
    profile = derive_production_design_profile(ctx, openai_api_key="")
    assert "#87CEEB" in profile["visual_dna"]
    assert "#FF69B4" in profile["visual_dna"]
