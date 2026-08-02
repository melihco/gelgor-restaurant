"""Platform CTA greens / pastel deco must never become brand_primary from website kits."""

from app.services.website_brand_kit_service import (
    _expand_hex,
    _is_pastel_noise,
    _pick_palette,
)


def test_whatsapp_and_cta_greens_are_skipped():
    assert _expand_hex("#25d366") is None
    assert _expand_hex("#25D366") is None
    assert _expand_hex("#128c7e") is None
    assert _expand_hex("#00a884") is None
    assert _expand_hex("#1877f2") is None


def test_css_named_beach_pastels_are_skipped():
    assert _expand_hex("#87ceeb") is None  # lightskyblue
    assert _expand_hex("#ff69b4") is None  # hotpink
    assert _expand_hex("#00ffff") is None  # aqua
    assert _is_pastel_noise("#87ceeb") is True
    assert _is_pastel_noise("#ff69b4") is True


def test_real_brand_green_still_accepted():
    assert _expand_hex("#4CAF50") == "#4caf50"
    assert _expand_hex("#2E7D32") == "#2e7d32"


def test_pick_palette_prefers_teal_sand_over_pastel_noise():
    primary, accent = _pick_palette([
        "#87ceeb", "#ff69b4", "#007b7f", "#f4a261", "#ffffff",
    ])
    assert primary == "#007b7f"
    assert accent == "#f4a261"
