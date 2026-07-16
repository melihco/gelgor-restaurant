"""Feed Art Director — catalog_slot_key normalizer tests."""

from __future__ import annotations

from app.crew.crews.feed_art_director_crew import _normalize_production_assignments
from app.services.feed_director_slot_catalog import (
    apply_catalog_slot_to_entry,
    build_weekly_catalog_assignment_plan,
    catalog_slot_key_valid,
    pick_catalog_slot_key,
    resolve_catalog_slot_key,
)

RESTAURANT_CATALOG = [
    {
        "slot_key": "restaurant_cafe_brunch_offer_post",
        "label_tr": "Brunch teklifi",
        "format": "post",
        "pipeline": "fal_design",
        "slot_role": "designed_post",
        "design_template_type": "campaign_announcement",
    },
    {
        "slot_key": "restaurant_cafe_new_menu_story",
        "label_tr": "Yeni menü story",
        "format": "story",
        "pipeline": "fal_story",
        "slot_role": "campaign_story_motion",
        "design_template_type": "editorial_story",
    },
    {
        "slot_key": "restaurant_cafe_event_announcement_story",
        "label_tr": "Etkinlik duyuru",
        "format": "story",
        "pipeline": "fal_story",
        "slot_role": "campaign_story_motion",
        "design_template_type": "event_special",
    },
    {
        "slot_key": "restaurant_cafe_atmosphere_reel",
        "label_tr": "Atmosfer reel",
        "format": "reel",
        "pipeline": "fal_reel",
        "slot_role": "organic_reel",
        "design_template_type": "reel_motion",
    },
]


def test_resolve_catalog_slot_key_preserves_valid_fd_choice():
    used: set[str] = set()
    entry = {
        "slot_role": "designed_post",
        "pipeline": "fal_design",
        "catalog_slot_key": "restaurant_cafe_brunch_offer_post",
    }
    key = resolve_catalog_slot_key(entry, RESTAURANT_CATALOG, used)
    assert key == "restaurant_cafe_brunch_offer_post"


def test_pick_catalog_slot_key_rotates_story_slots():
    used: set[str] = set()
    first = pick_catalog_slot_key(
        "campaign_story_motion", "fal_story", RESTAURANT_CATALOG, used
    )
    assert first in {
        "restaurant_cafe_new_menu_story",
        "restaurant_cafe_event_announcement_story",
    }
    used.add(first or "")
    second = pick_catalog_slot_key(
        "campaign_story_motion", "fal_story", RESTAURANT_CATALOG, used
    )
    assert second != first
    assert second in {
        "restaurant_cafe_new_menu_story",
        "restaurant_cafe_event_announcement_story",
    }


def test_catalog_slot_key_valid_rejects_format_mismatch():
    assert not catalog_slot_key_valid(
        "restaurant_cafe_brunch_offer_post",
        "campaign_story_motion",
        "fal_story",
        RESTAURANT_CATALOG,
    )
    assert catalog_slot_key_valid(
        "restaurant_cafe_event_announcement_story",
        "campaign_story_motion",
        "fal_story",
        RESTAURANT_CATALOG,
    )


def test_build_weekly_catalog_assignment_plan_respects_format_mix():
    plan = build_weekly_catalog_assignment_plan(RESTAURANT_CATALOG)
    assert len(plan) == 16
    keys = [s["slot_key"] for s in plan]
    assert keys.count("restaurant_cafe_brunch_offer_post") >= 1
    assert "restaurant_cafe_new_menu_story" in keys
    assert "restaurant_cafe_event_announcement_story" in keys


def test_normalize_weekly_catalog_first():
    report = {
        "production_assignments": [
            {
                "idea_index": 0,
                "slot_role": "designed_post",
                "pipeline": "fal_design",
                "catalog_slot_key": "restaurant_cafe_brunch_offer_post",
            },
            {
                "idea_index": 1,
                "slot_role": "campaign_story_motion",
                "pipeline": "fal_story",
                "library_slot_key": "daily_story",
            },
        ]
    }
    ideas = [{"content_type": "post"}, {"content_type": "story"}] * 8
    _normalize_production_assignments(
        report,
        len(ideas),
        ideas=ideas,
        production_package="weekly_content",
        catalog_slots=RESTAURANT_CATALOG,
    )
    assignments = report["production_assignments"]
    assert report.get("catalog_first") is True
    assert len(assignments) == 16
    assert all(a.get("catalog_slot_key") for a in assignments)
    assert all(a.get("catalog_slot_label") for a in assignments)
    assert all("library_slot_key" not in a for a in assignments)
    assert assignments[0]["catalog_slot_key"] == "restaurant_cafe_brunch_offer_post"
    story_keys = {
        a["catalog_slot_key"]
        for a in assignments
        if a.get("format") == "story" or "story" in str(a.get("slot_role", ""))
    }
    assert story_keys <= {
        "restaurant_cafe_new_menu_story",
        "restaurant_cafe_event_announcement_story",
    }


def test_normalize_weekly_assignments_inject_catalog_keys():
    report = {
        "production_assignments": [
            {
                "idea_index": 0,
                "slot_role": "designed_post",
                "pipeline": "fal_design",
                "catalog_slot_key": "restaurant_cafe_brunch_offer_post",
            },
            {
                "idea_index": 1,
                "slot_role": "campaign_story_motion",
                "pipeline": "fal_story",
                "library_slot_key": "daily_story",
            },
        ]
    }
    ideas = [{"content_type": "post"}, {"content_type": "story"}] * 8
    _normalize_production_assignments(
        report,
        len(ideas),
        ideas=ideas,
        production_package="weekly_content",
        catalog_slots=RESTAURANT_CATALOG,
    )
    assignments = report["production_assignments"]
    assert len(assignments) == 16
    assert report.get("catalog_first") is True
    assert all(a.get("catalog_slot_key") for a in assignments)
    assert assignments[0]["catalog_slot_key"] == "restaurant_cafe_brunch_offer_post"
    story_keys = {
        a["catalog_slot_key"]
        for a in assignments
        if "story" in str(a.get("slot_role", ""))
    }
    assert story_keys <= {
        "restaurant_cafe_new_menu_story",
        "restaurant_cafe_event_announcement_story",
    }
    assert len(story_keys) >= 1
    assert all("library_slot_key" not in a for a in assignments)


def test_apply_catalog_slot_skips_organic_post():
    entry = {"slot_role": "organic_post", "pipeline": "gallery_photo"}
    used: set[str] = set()
    apply_catalog_slot_to_entry(entry, RESTAURANT_CATALOG, used)
    assert "catalog_slot_key" not in entry
