"""Tests for production_design_policy — beach_club + local_products_shop."""

from app.services.production_design_policy import (
    apply_production_layers_to_theme_dict,
    is_premium_venue_sector,
    pillars_need_realignment,
    resolve_content_pillars,
    resolve_fal_design_intensity,
    resolve_typography_design,
    resolve_typography_vibe,
    sector_anti_patterns,
)


def test_beach_club_gets_premium_fal_intensity_and_editorial_vibe():
    sector = "beach_club"
    dna = "Mood: bohemian-luxe, Cycladic agora, quiet luxury editorial"
    assert is_premium_venue_sector(sector)
    intensity = resolve_fal_design_intensity(sector, "minimal")
    assert intensity["story"] == "photo_first"
    assert intensity["reel"] == "elegant_light"
    assert intensity["post"] == "elegant_light"
    vibe = resolve_typography_vibe(sector, dna)
    assert vibe in ("warm_coastal", "editorial_serif")
    typo = resolve_typography_design(sector, dna)
    assert typo["background_style"] == "photo_overlay"
    assert typo["logo_treatment"] == "watermark"
    assert len(sector_anti_patterns(sector)) >= 4


def test_local_products_shop_gets_photo_first_and_artisan_policy():
    sector = "local_products_shop"
    intensity = resolve_fal_design_intensity(sector, "minimal")
    assert intensity["story"] == "photo_first"
    assert intensity["post"] == "elegant_light"
    vibe = resolve_typography_vibe(sector, "organic artisan honey farm natural")
    assert vibe == "retro_poster"
    pillars = resolve_content_pillars(sector, ["lead_generation"])
    assert "product_highlight" in pillars
    assert "behind_the_scenes" in pillars


def test_hospitality_pillar_realignment_from_beauty_leak():
    bad = ["service_intro", "educational_post", "lead_generation", "social_proof"]
    assert pillars_need_realignment("beach_club", bad) is True
    fixed = resolve_content_pillars("beach_club", bad)
    assert "daily_story" in fixed
    assert "event_announcement" in fixed
    assert "educational_post" not in fixed or fixed.count("educational_post") == 0


def test_apply_production_layers_preserves_confirmed_typography():
    theme = {
        "typography": {"text_overlay_density": "minimal"},
        "palette": {"accent": "#C4A484"},
        "typography_design": {
            "vibe": "warm_coastal",
            "text_effect": "soft_shadow",
            "background_style": "photo_overlay",
            "logo_treatment": "watermark",
            "confirmed_at": "2026-07-11T12:00:00.000Z",
            "source": "user",
        },
    }
    out = apply_production_layers_to_theme_dict(
        theme,
        sector="beach_club",
        visual_dna="neon nightlife club energy",
        languages="tr",
    )
    assert out["typography_design"]["vibe"] == "warm_coastal"
    assert out["typography_design"]["confirmed_at"] == "2026-07-11T12:00:00.000Z"


def test_apply_production_layers_merges_into_theme_dict():
    theme = {
        "typography": {"text_overlay_density": "minimal"},
        "palette": {"accent": "#C4A484"},
        "anti_patterns": [],
        "motion_profile": {"operator_override": False, "locale": "tr"},
    }
    out = apply_production_layers_to_theme_dict(
        theme,
        sector="beach_club",
        visual_dna="bohemian-luxe quiet luxury Aegean",
        languages="en",
    )
    assert out.get("typography_design", {}).get("vibe")
    assert out.get("fal_design_intensity", {}).get("story") == "photo_first"
    assert len(out.get("anti_patterns") or []) >= 3
    assert out.get("motion_profile", {}).get("locale") == "en"
