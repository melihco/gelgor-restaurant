"""Tests for production_design_profile_service heuristic paths."""

import json

from app.services.production_design_profile_service import (
    _brand_palette_hexes_from_ctx,
    build_production_design_llm_prompt,
    collect_production_design_context,
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
    out = ensure_visual_dna_palette_hex(dna, ["#007B7F", "#F4A261"])
    assert "#007B7F" in out
    assert "#F4A261" in out
    assert "Palette words:" in out


def test_ensure_visual_dna_palette_hex_skips_when_present():
    dna = "Palette words: #112233 accent #AABBCC"
    out = ensure_visual_dna_palette_hex(dna, ["#112233"])
    assert out == dna


def test_ensure_visual_dna_palette_hex_rewrites_stale_pastel_anchors():
    dna = (
        "Mood: coastal\n"
        "Palette words: sky-bright cyan #87CEEB, playful coral-pink #FF69B4 — brand anchors #87CEEB · #FF69B4\n"
        "Lighting: sun"
    )
    out = ensure_visual_dna_palette_hex(dna, ["#007B7F", "#F4A261"])
    assert "#007B7F" in out
    assert "#F4A261" in out
    assert "#87CEEB" not in out
    assert "#FF69B4" not in out


def test_brand_palette_hexes_prefer_vibe_over_stale_columns():
    ctx = _FakeCtx(
        brand_primary_color="#87CEEB",
        brand_accent_color="#FF69B4",
        brand_vibe_profile={
            "palette": {"primary": "#007B7F", "accent": "#F4A261"},
        },
        brand_theme={
            "palette": {"primary": "#007B7F", "accent": "#F4A261"},
        },
    )
    hexes = _brand_palette_hexes_from_ctx(ctx)
    assert hexes[0] == "#007B7F"
    assert hexes[1] == "#F4A261"
    # Stale pastels may trail but must not lead
    assert hexes.index("#007B7F") < hexes.index("#87CEEB") if "#87CEEB" in hexes else True


def test_derive_injects_palette_from_brand_kit():
    ctx = _FakeCtx(
        workspace_id="431b2901-a2dc-4df6-abe3-3670d9844851",
        business_name="Sarnic Beach",
        business_type="beach_club",
        brand_primary_color="#007B7F",
        brand_accent_color="#F4A261",
        brand_vibe_profile={
            "palette": {"primary": "#007B7F", "accent": "#F4A261"},
        },
        brand_service_profile={"category": "beach_club_bar"},
    )
    profile = derive_production_design_profile(ctx, openai_api_key="")
    assert "#007B7F" in profile["visual_dna"]
    assert "#F4A261" in profile["visual_dna"]


def test_collect_context_includes_vibe_website_and_ig_signals():
    ctx = _FakeCtx(
        business_name="Yula Bodrum",
        business_type="beach_club",
        website_summary="Drink & Chill daybeds",
        instagram_handle="yulabodrum",
        instagram_recent_captions=["Sunset spritz on the daybed", "Citrus chill"],
        website_intelligence={"menu_highlights": ["passion fruit spritz", "mandarin sour"]},
        instagram_intelligence={"aesthetic": "citrus coastal cocktails"},
        brand_vibe_profile={
            "motion": {"pace": "slow_observational"},
            "palette": {"primary": "#00C5CC"},
            "anti_patterns": ["neon EDM"],
        },
        gallery_analysis={
            "https://example.com/a.jpg": {
                "tags": ["daybed", "cocktail"],
                "description": "turquoise daybed with citrus garnish",
            }
        },
        brand_service_profile={
            "category": "beach_club_bar",
            "signature_offerings": ["Drink & Chill"],
        },
    )
    data = collect_production_design_context(ctx)
    assert data["brand_vibe_profile"]["motion"]["pace"] == "slow_observational"
    assert "passion fruit spritz" in data["menu_or_catalog_signals"]
    assert "Sunset spritz" in data["instagram_recent_captions"][0]
    assert "daybed" in data["gallery_scene_summary"].lower()
    assert data["instagram_intelligence"]["aesthetic"]


def test_llm_prompt_includes_rich_signals_and_forbids_generic_boilerplate():
    data = collect_production_design_context(
        _FakeCtx(
            business_name="Yula Bodrum",
            business_type="beach_club",
            website_summary="Drink & Chill",
            instagram_handle="yulabodrum",
            instagram_recent_captions=["Citrus chill by the sea"],
            website_intelligence={"menu_highlights": ["mandarin sour"]},
            brand_vibe_profile={"grading": {"look": "citrus_golden_coastal"}},
            brand_service_profile={
                "category": "beach_club_bar",
                "signature_offerings": ["Drink & Chill"],
            },
        )
    )
    prompt = build_production_design_llm_prompt(data, "beach_club")
    assert "Yula Bodrum" in prompt
    assert "mandarin sour" in prompt
    assert "citrus_golden_coastal" in prompt
    assert "Citrus chill" in prompt
    assert "FORBIDDEN generic boilerplate" in prompt
    assert "Cycladic" in prompt  # named as forbidden example
    assert "Brand-SPECIFIC" in prompt or "BRAND-SPECIFIC" in prompt
