"""Feed Art Director — catalog_slot_key normalizer tests."""

from __future__ import annotations

import json

from app.crew.crews.feed_art_director_crew import _normalize_production_assignments
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.crew.tasks.feed_art_director_tasks import (
    build_fd_gallery_coverage_block,
    build_feed_director_briefing_block,
    create_feed_cohesion_task,
    parse_content_ideas_json,
    truncate_content_ideas_json_for_fd,
)
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
        "slot_key": "restaurant_cafe_signature_dish_post",
        "label_tr": "İmza tabak",
        "format": "post",
        "pipeline": "fal_design",
        "slot_role": "fal_designed_post",
        "design_template_type": "menu_highlight",
    },
    {
        "slot_key": "restaurant_cafe_customer_review_post",
        "label_tr": "Müşteri yorumu",
        "format": "post",
        "pipeline": "fal_design",
        "slot_role": "fal_designed_post",
        "design_template_type": "social_proof",
    },
    {
        "slot_key": "restaurant_cafe_dining_ambiance_post",
        "label_tr": "Yemek atmosferi",
        "format": "post",
        "pipeline": "fal_design",
        "slot_role": "fal_designed_post",
        "design_template_type": "venue_showcase",
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


def test_resolve_catalog_slot_key_rejects_duplicate_and_picks_idea_match():
    """Gel Gör bug: FD stamped İmza tabak on every post — rematch uniquely."""
    used = {"restaurant_cafe_signature_dish_post"}
    entry = {
        "slot_role": "fal_designed_post",
        "pipeline": "fal_design",
        "catalog_slot_key": "restaurant_cafe_signature_dish_post",
    }
    idea = {
        "announcement_type": "social_proof",
        "caption_draft": "Müşterilerimizden gelen geri bildirimlere kulak veriyoruz.",
    }
    key = resolve_catalog_slot_key(entry, RESTAURANT_CATALOG, used, idea=idea)
    assert key == "restaurant_cafe_customer_review_post"
    assert key not in used


def test_normalize_dedupes_repeated_signature_dish_across_posts():
    report = {
        "production_assignments": [
            {
                "idea_index": 0,
                "slot_role": "fal_designed_post",
                "pipeline": "fal_design",
                "catalog_slot_key": "restaurant_cafe_signature_dish_post",
            },
            {
                "idea_index": 1,
                "slot_role": "fal_designed_post",
                "pipeline": "fal_design",
                "catalog_slot_key": "restaurant_cafe_signature_dish_post",
            },
            {
                "idea_index": 2,
                "slot_role": "fal_designed_post",
                "pipeline": "fal_design",
                "catalog_slot_key": "restaurant_cafe_signature_dish_post",
            },
        ]
    }
    ideas = [
        {
            "content_type": "post",
            "announcement_type": "product_reveal",
            "caption_draft": "Bahçemizde serpme köy kahvaltısını tadın",
        },
        {
            "content_type": "post",
            "announcement_type": "social_proof",
            "caption_draft": "Müşterilerimiz kahvaltılarımızı çok sevdi",
        },
        {
            "content_type": "post",
            "announcement_type": "offer_campaign",
            "caption_draft": "Bu yaz bahçemizde eşsiz bir deneyim",
        },
    ]
    _normalize_production_assignments(
        report,
        len(ideas),
        ideas=ideas,
        production_package="weekly_content",
        catalog_slots=RESTAURANT_CATALOG,
    )
    keys = [a["catalog_slot_key"] for a in report["production_assignments"]]
    assert keys[0] == "restaurant_cafe_signature_dish_post"
    assert keys[1] == "restaurant_cafe_customer_review_post"
    assert len(set(keys)) == 3


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
    assert len(plan) == 15
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
    ideas = [
        {"content_type": "post"},
        {"content_type": "story"},
        {"content_type": "reel"},
        {"content_type": "post"},
    ]
    _normalize_production_assignments(
        report,
        len(ideas),
        ideas=ideas,
        production_package="weekly_content",
        catalog_slots=RESTAURANT_CATALOG,
    )
    assignments = report["production_assignments"]
    assert report.get("catalog_first") is True
    assert len(assignments) == 4
    assert [a["idea_index"] for a in assignments] == [0, 1, 2, 3]
    assert len({a["idea_index"] for a in assignments}) == 4
    assert all(a.get("catalog_slot_key") for a in assignments)
    assert all(a.get("catalog_slot_label") for a in assignments)
    assert all("library_slot_key" not in a for a in assignments)
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
    ideas = [
        {"content_type": "post"},
        {"content_type": "story"},
        {"content_type": "post"},
    ]
    _normalize_production_assignments(
        report,
        len(ideas),
        ideas=ideas,
        production_package="weekly_content",
        catalog_slots=RESTAURANT_CATALOG,
    )
    assignments = report["production_assignments"]
    assert len(assignments) == 3
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


def test_truncate_content_ideas_json_preserves_valid_array():
    """Blind char-slice used to break json.loads and skip catalog-first normalize."""
    ideas = [
        {
            "title": f"Idea {i}",
            "caption": ("Yaz atmosferi Bodrum sahil deneyimi " * 80).strip(),
            "hook": ("Akşam ışığı ve soğuk meze " * 40).strip(),
            "content_type": "post",
        }
        for i in range(16)
    ]
    raw = json.dumps(ideas, ensure_ascii=False, indent=2)
    assert len(raw) > 24_000
    sliced_blind = raw[:24_000]
    assert parse_content_ideas_json(sliced_blind) == []

    truncated = truncate_content_ideas_json_for_fd(raw, max_chars=24_000)
    parsed = parse_content_ideas_json(truncated)
    assert len(parsed) >= 1
    assert len(truncated) <= 24_000
    assert all(isinstance(item, dict) for item in parsed)


def test_truncate_content_ideas_json_keeps_all_when_compact_fits():
    ideas = [{"title": f"i{i}", "caption": "x" * 200} for i in range(8)]
    raw = json.dumps(ideas, ensure_ascii=False, indent=4)
    compact = json.dumps(ideas, ensure_ascii=False)
    assert len(raw) > len(compact)
    out = truncate_content_ideas_json_for_fd(raw, max_chars=len(compact) + 10)
    assert parse_content_ideas_json(out) == ideas


def test_fd_gallery_coverage_lists_topics_and_grounding_rules():
    brand = SimpleNamespace(
        gallery_analysis=json.dumps(
            {
                "https://ex.com/a.jpg": {
                    "contentTags": ["cocktail", "citrus"],
                    "bestFor": ["food_showcase"],
                },
                "https://ex.com/b.jpg": {
                    "contentTags": ["terrace", "sunset"],
                    "bestFor": ["venue_photo"],
                },
            }
        ),
        reference_image_urls=[],
        used_image_urls=["https://ex.com/a.jpg"],
        used_images_by_type={"feed": ["https://ex.com/a.jpg"]},
    )
    block = build_fd_gallery_coverage_block(brand)
    assert "cocktail" in block
    assert "terrace" in block
    assert "GALLERY GROUNDING" in block
    assert "NEVER invent" in block
    assert "NEVER published" in block
    assert "UNUSED gallery subjects" in block
    assert "terrace" in block
    assert "https://ex.com" not in block  # compact — no URL dump


def test_create_feed_cohesion_task_includes_briefing_context():
    briefing = build_feed_director_briefing_block(
        SimpleNamespace(
            gallery_analysis=json.dumps(
                {
                    "https://ex.com/a.jpg": {
                        "contentTags": ["cocktail", "glass"],
                        "bestFor": ["food_showcase"],
                    }
                }
            ),
            reference_image_urls=[],
            business_type="beach_club",
            description="Bodrum beach cocktails",
            location="Bodrum",
            city="Bodrum",
            business_name="Yula",
        )
    )
    assert "Gallery coverage" in briefing
    captured: dict = {}

    def _fake_task(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(**kwargs)

    with patch("app.crew.tasks.feed_art_director_tasks.Task", side_effect=_fake_task):
        create_feed_cohesion_task(
            agent=MagicMock(),
            brand_name="Yula",
            business_type="beach_club",
            weekly_theme="Citrus week",
            content_ideas_json=json.dumps(
                [{"title": "Sunset", "format": "post", "caption_draft": "Cheers"}]
            ),
            briefing_context=briefing,
        )
    desc = str(captured.get("description") or "")
    assert "Brand visual briefing" in desc
    assert "cocktail" in desc
    assert "visual_subject_hint" in desc
