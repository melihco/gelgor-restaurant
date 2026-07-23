"""Unit tests for slot catalog authoring (validation + key composition)."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.slot_catalog_authoring import (
    ALLOWED_DESIGN_TEMPLATE_TYPES,
    ALLOWED_LIBRARY_SLOT_KEYS,
    ALLOWED_SLOT_FORMATS,
    build_catalog_slot_key,
    normalize_slug,
    slot_visible_to_workspace,
    validate_sector_id,
    validate_slot_key,
    validate_slot_payload,
    validate_slot_suffix,
)


def test_normalize_slug():
    assert normalize_slug("Beach Club") == "beach_club"
    assert normalize_slug("restaurant-cafe!") == "restaurant_cafe"


def test_validate_sector_id():
    assert validate_sector_id("beach_club") == "beach_club"
    with pytest.raises(ValueError, match="invalid_sector_id"):
        validate_sector_id("1bad")
    with pytest.raises(ValueError, match="invalid_sector_id"):
        validate_sector_id("A")


def test_validate_slot_key_and_suffix():
    assert validate_slot_key("beach_club_dj_night_teaser_post") == "beach_club_dj_night_teaser_post"
    with pytest.raises(ValueError, match="invalid_slot_key"):
        validate_slot_key("x")
    assert validate_slot_suffix("brunch_social_post") == "brunch_social_post"
    with pytest.raises(ValueError, match="invalid_slot_suffix"):
        validate_slot_suffix("9bad")


def test_build_catalog_slot_key_global_and_brand():
    assert build_catalog_slot_key("restaurant_cafe", "brunch_social_post") == (
        "restaurant_cafe_brunch_social_post"
    )
    wid = uuid.UUID("0466adb9-1111-2222-3333-444444444444")
    key = build_catalog_slot_key(
        "restaurant_cafe",
        "brunch_social_post",
        owner_workspace_id=wid,
    )
    assert key.startswith("restaurant_cafe_brand_0466adb9_")
    assert key.endswith("brunch_social_post")


def test_validate_slot_payload_defaults_pipeline_and_role():
    fields = validate_slot_payload(
        {
            "label_tr": "Brunç",
            "label_en": "Brunch",
            "format": "post",
        },
        partial=False,
    )
    assert fields["format"] == "post"
    assert fields["pipeline"] == "fal_design"
    assert fields["slot_role"] == "fal_designed_post"
    assert fields["tier"] == "standard"


def test_validate_slot_payload_rejects_bad_format_and_template_type():
    with pytest.raises(ValueError, match="invalid_format"):
        validate_slot_payload(
            {"label_tr": "A", "label_en": "B", "format": "tiktok"},
            partial=False,
        )
    with pytest.raises(ValueError, match="invalid_design_template_type"):
        validate_slot_payload(
            {
                "label_tr": "A",
                "label_en": "B",
                "format": "post",
                "design_template_type": "not_a_type",
            },
            partial=False,
        )


def test_validate_slot_payload_library_shelf_and_partial():
    assert "campaign_post" in ALLOWED_LIBRARY_SLOT_KEYS
    assert "social_proof" in ALLOWED_DESIGN_TEMPLATE_TYPES
    assert "post" in ALLOWED_SLOT_FORMATS

    fields = validate_slot_payload(
        {"library_slot_key": "campaign_post", "label_tr": "Kampanya"},
        partial=True,
    )
    assert fields["library_slot_key"] == "campaign_post"
    assert fields["label_tr"] == "Kampanya"
    assert "format" not in fields

    with pytest.raises(ValueError, match="invalid_library_slot_key"):
        validate_slot_payload({"library_slot_key": "unknown_shelf"}, partial=True)


def test_slot_visible_to_workspace_rules():
    global_slot = SimpleNamespace(owner_workspace_id=None)
    brand_a = uuid.uuid4()
    brand_b = uuid.uuid4()
    private = SimpleNamespace(owner_workspace_id=brand_a)

    assert slot_visible_to_workspace(global_slot, None) is True
    assert slot_visible_to_workspace(global_slot, brand_a) is True
    assert slot_visible_to_workspace(private, None) is False
    assert slot_visible_to_workspace(private, brand_a) is True
    assert slot_visible_to_workspace(private, brand_b) is False


def test_story_and_reel_infer_defaults():
    story = validate_slot_payload(
        {"label_tr": "S", "label_en": "S", "format": "story"},
        partial=False,
    )
    assert story["pipeline"] == "fal_story"
    assert story["slot_role"] == "campaign_story_motion"

    reel = validate_slot_payload(
        {"label_tr": "R", "label_en": "R", "format": "reel"},
        partial=False,
    )
    assert reel["pipeline"] == "fal_reel"
    assert reel["slot_role"] == "fal_reel_motion"
