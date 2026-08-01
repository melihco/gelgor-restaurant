"""Brand Hub post_design_defaults must survive BrandTheme PUT validation."""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.brand_theme import BrandTheme, BrandThemeSaveRequest
from app.services.brand_theme_service import _merge_theme_dict_for_save


def _minimal_theme(**extra):
    now = datetime.now(timezone.utc)
    base = {
        "workspace_id": "0466adb9-9fd3-40a6-85c1-66d23fb4d094",
        "derived_at": now,
        "source": "manual_colors",
        "palette": {
            "primary": "#4CAF50",
            "accent": "#FFEB3B",
            "neutral": "#FFFFFF",
            "shadow": "#8B8B8B",
        },
        "typography": {
            "heading_font": "Fraunces",
            "body_font": "Source Sans 3",
            "personality": "warm",
            "text_overlay_density": "minimal",
        },
        "composition": {
            "primary_pattern": "rule_of_thirds",
            "subject_focus": "garden dining",
            "text_safe_area_fraction": 0.6,
        },
        "grading": {"look": "warm_natural", "lut_directive": "golden hour"},
        "overlay": {"color": "#3d5a3a", "opacity": 0.22},
        "layout": {
            "default_layout_id": "feed_square",
            "spacing_base": 8,
            "border_radius": 12,
        },
    }
    base.update(extra)
    return base


def test_brand_theme_keeps_post_design_defaults():
    theme = BrandTheme.model_validate(
        _minimal_theme(
            post_design_defaults={
                "font_preset": "elegant_serif",
                "text_effect": "soft_shadow",
                "logo_position": "bottom_right",
            },
            typography_design={
                "vibe": "handwritten",
                "text_effect": "soft_shadow",
                "background_style": "photo_overlay",
                "source": "user",
            },
        )
    )
    dumped = theme.model_dump(mode="json")
    assert dumped["post_design_defaults"]["font_preset"] == "elegant_serif"
    assert dumped["post_design_defaults"]["text_effect"] == "soft_shadow"
    assert dumped["typography_design"]["vibe"] == "handwritten"


def test_save_request_round_trips_post_design_defaults():
    payload = BrandThemeSaveRequest.model_validate(
        {
            "theme": _minimal_theme(
                post_design_defaults={
                    "font_preset": "poster_3d",
                    "text_effect": "extrude_3d",
                    "logo_position": "top_left",
                }
            )
        }
    )
    assert payload.theme.post_design_defaults["font_preset"] == "poster_3d"


def test_merge_preserves_post_design_when_incoming_omits():
    existing = {
        "post_design_defaults": {
            "font_preset": "elegant_serif",
            "text_effect": "soft_shadow",
        },
        "typography_design": {"vibe": "handwritten"},
    }
    incoming = _minimal_theme(palette={"primary": "#111", "accent": "#222", "neutral": "#fff", "shadow": "#000"})
    # simulate pydantic dump without optional hub keys
    incoming.pop("post_design_defaults", None)
    incoming.pop("typography_design", None)
    merged = _merge_theme_dict_for_save(incoming, existing)
    assert merged["post_design_defaults"]["font_preset"] == "elegant_serif"
    assert merged["typography_design"]["vibe"] == "handwritten"
