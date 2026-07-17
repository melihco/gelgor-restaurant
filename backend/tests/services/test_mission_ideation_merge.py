from app.services.mission_ideation_merge import (
    merge_ideation_ideas,
    resolve_feed_package_total,
    resolve_mission_production_target,
    resolve_format_targets,
)


def idea(title: str, fmt: str) -> dict:
    return {
        "concept_title": title,
        "format": fmt,
        "caption_draft": f"Caption for {title}",
    }


def test_resolve_mission_production_target_uses_idea_count() -> None:
    assert resolve_mission_production_target(25, has_calendar=True, mission_type="seasonal") == 25
    assert resolve_mission_production_target(0, has_calendar=True, mission_type="seasonal") == 16
    assert resolve_mission_production_target(8, has_calendar=False, mission_type="seasonal") == 8
    assert resolve_mission_production_target(11, has_calendar=True, mission_type="seasonal") == 11


    assert resolve_feed_package_total("opportunity") == 3
    assert resolve_feed_package_total(hub_production_package="opportunity") == 3
    assert resolve_feed_package_total("seasonal") == 16
    assert resolve_feed_package_total("seasonal", subscription_plan_slug="starter") == 12


def test_resolve_format_targets_switches_for_opportunity_and_starter() -> None:
    assert resolve_format_targets("opportunity") == {"story": 1, "post": 1, "reel": 1}
    assert resolve_format_targets("seasonal")["post"] == 6
    assert resolve_format_targets("seasonal")["story"] == 3
    assert resolve_format_targets("seasonal")["reel"] == 6
    starter = resolve_format_targets("seasonal", subscription_plan_slug="starter")
    assert starter == {"story": 3, "post": 4, "carousel": 1, "reel": 4}


def test_merge_ideation_ideas_hits_agency_format_targets_and_dedupes() -> None:
    ideas = [
        idea("Story A unique", "story"),
        idea("Story B unique", "story"),
        idea("Story C unique", "story"),
        idea("Story D overflow", "story"),
        idea("Post A unique", "post"),
        idea("Post B unique", "post"),
        idea("Post C unique", "post"),
        idea("Post D unique", "post"),
        idea("Post E unique", "post"),
        idea("Post F unique", "post"),
        idea("Post G overflow", "post"),
        idea("Carousel unique", "carousel"),
        idea("Reel A unique", "reel"),
        idea("Reel B unique", "reel"),
        idea("Reel C unique", "reel"),
        idea("Reel D unique", "reel"),
        idea("Reel E unique", "reel"),
        idea("Reel F unique", "reel"),
        idea("Reel B unique", "reel"),  # duplicate by concept title
    ]

    merged = merge_ideation_ideas([ideas], mission_type="seasonal")

    assert len(merged) == 16
    assert sum(1 for x in merged if x["format"] == "story") == 3
    assert sum(1 for x in merged if x["format"] == "post") == 6
    assert sum(1 for x in merged if x["format"] == "carousel") == 1
    assert sum(1 for x in merged if x["format"] == "reel") == 6
    assert [x["concept_title"] for x in merged].count("Reel B unique") == 1


def test_merge_ideation_ideas_hits_starter_format_targets() -> None:
    ideas = [
        idea("Story A", "story"),
        idea("Story B", "story"),
        idea("Story C", "story"),
        idea("Post A", "post"),
        idea("Post B", "post"),
        idea("Post C", "post"),
        idea("Post D", "post"),
        idea("Carousel", "carousel"),
        idea("Reel A", "reel"),
        idea("Reel B", "reel"),
        idea("Reel C", "reel"),
        idea("Reel D", "reel"),
    ]

    merged = merge_ideation_ideas(
        [ideas],
        mission_type="seasonal",
        subscription_plan_slug="starter",
    )

    assert len(merged) == 12
    assert sum(1 for x in merged if x["format"] == "post") == 4
    assert sum(1 for x in merged if x["format"] == "reel") == 4


def test_merge_ideation_ideas_prefers_distinct_headlines_over_near_duplicates() -> None:
    ideas = [
        idea("Kahvaltı keyfi", "story"),
        idea("Kahvaltı keyfi başlıyor", "story"),  # near-duplicate of #1
        idea("Lezzet molası", "story"),
        idea("Şefin önerisi", "story"),
        idea("Akşam menüsü", "story"),
        idea("Post A unique", "post"),
        idea("Post B unique", "post"),
        idea("Post C unique", "post"),
        idea("Post D unique", "post"),
        idea("Post E unique", "post"),
        idea("Post F unique", "post"),
        idea("Carousel unique", "carousel"),
        idea("Reel A unique", "reel"),
        idea("Reel B unique", "reel"),
        idea("Reel C unique", "reel"),
        idea("Reel D unique", "reel"),
        idea("Reel E unique", "reel"),
        idea("Reel F unique", "reel"),
    ]

    merged = merge_ideation_ideas([ideas], mission_type="seasonal")
    story_titles = [x["concept_title"] for x in merged if x["format"] == "story"]

    assert len(merged) == 16
    assert len(story_titles) == 3
    assert "Kahvaltı keyfi başlıyor" not in story_titles
    assert "Kahvaltı keyfi" in story_titles


def test_merge_ideation_ideas_preserves_count_when_only_near_duplicates() -> None:
    ideas = [
        idea("Kahvaltı", "story"),
        idea("Kahvaltı keyfi", "story"),
        idea("Kahvaltı keyfi başlıyor", "story"),
        idea("Post A unique", "post"),
        idea("Post B unique", "post"),
        idea("Post C unique", "post"),
        idea("Post D unique", "post"),
        idea("Post E unique", "post"),
        idea("Post F unique", "post"),
        idea("Carousel unique", "carousel"),
        idea("Reel A unique", "reel"),
        idea("Reel B unique", "reel"),
        idea("Reel C unique", "reel"),
        idea("Reel D unique", "reel"),
        idea("Reel E unique", "reel"),
        idea("Reel F unique", "reel"),
    ]

    merged = merge_ideation_ideas([ideas], mission_type="seasonal")
    story_titles = [x["concept_title"] for x in merged if x["format"] == "story"]

    assert sum(1 for x in merged if x["format"] == "story") == 3
    assert len(merged) == 16
    assert len(story_titles) == 3


def test_merge_ideation_ideas_uses_overflow_when_target_bucket_is_short() -> None:
    ideas = [
        idea("Story A unique", "story"),
        idea("Post A unique", "post"),
        idea("Post B unique", "post"),
        idea("Post C unique", "post"),
    ]

    merged = merge_ideation_ideas([ideas], mission_type="opportunity")

    assert len(merged) == 3
    assert [x["concept_title"] for x in merged] == [
        "Story A unique",
        "Post A unique",
        "Post B unique",
    ]


def test_apply_calendar_schedule_overlay_preserves_ideation_copy() -> None:
    from app.services.mission_ideation_merge import apply_calendar_schedule_overlay

    ideation = [
        {
            "concept_title": "Erken Hasat",
            "caption_draft": "Datça caption.",
            "format": "post",
        },
    ]
    calendar = [
        {
            "event_name": "Erken Hasat",
            "format": "post",
            "day": "Fri",
            "time": "10:00",
        },
    ]

    result = apply_calendar_schedule_overlay(ideation, calendar)

    assert len(result) == 1
    assert result[0]["concept_title"] == "Erken Hasat"
    assert result[0]["caption_draft"] == "Datça caption."
    assert result[0]["publish_schedule_day"] == "Fri"
    assert result[0]["publish_schedule_time"] == "10:00"
    assert result[0]["source_node"] == "content_ideation"


def test_build_calendar_production_ideas_additive_track() -> None:
    from app.services.mission_ideation_merge import (
        CALENDAR_PRODUCTION_IDEA_INDEX_BASE,
        build_calendar_production_ideas,
    )

    ideas = build_calendar_production_ideas([
        {
            "event_name": "Meet the Maker: Local Artisans",
            "tagline": "Discover the stories behind our products",
            "content_brief": "Introduce the Meet the Maker series.",
            "photo_mood": "cozy artisan workshop or studio vibe",
            "format": "story",
            "announcement_type": "event_teaser",
            "date": "July 1, 2026",
            "time": "2 PM",
        },
    ])

    assert len(ideas) == 1
    assert ideas[0]["idea_index"] == CALENDAR_PRODUCTION_IDEA_INDEX_BASE
    assert ideas[0]["source_track"] == "calendar"
    assert ideas[0]["calendar_announcement_type"] == "event_teaser"
    assert ideas[0]["photo_mood"] == "cozy artisan workshop or studio vibe"
    assert ideas[0]["content_kind"] == "instagram_story"


def test_calendar_production_idea_caption_never_uses_visual_brief() -> None:
    from app.services.mission_ideation_merge import build_calendar_production_ideas

    ideas = build_calendar_production_ideas([
        {
            "event_name": "Meet the Maker: Local Artisans",
            "tagline": "Discover the stories behind our products",
            "content_brief": "Introduce the Meet the Maker series showcasing local artisans.",
            "photo_mood": "cozy artisan workshop",
            "format": "story",
        },
        {
            "event_name": "Sunset DJ Night",
            "caption": "Bu cumartesi gün batımında DJ performansı bizimle!",
            "content_brief": "Vibrant DJ night announcement by the beach with colorful crowd.",
            "format": "story",
        },
    ])

    # Publish caption = tagline + headline copy; brief stays in content_brief only.
    assert ideas[0]["caption_draft"] == (
        "Discover the stories behind our products — Meet the Maker: Local Artisans"
    )
    assert "showcasing" not in ideas[0]["caption_draft"]
    assert ideas[0]["content_brief"] == (
        "Introduce the Meet the Maker series showcasing local artisans."
    )
    # Explicit calendar caption wins when provided.
    assert ideas[1]["caption_draft"] == "Bu cumartesi gün batımında DJ performansı bizimle!"


def test_calendar_enrichment_keeps_ideation_caption_over_brief() -> None:
    from app.services.mission_ideation_merge import _enrich_ideation_with_calendar_plan

    row = _enrich_ideation_with_calendar_plan(
        {
            "concept_title": "Erken Hasat Zeytinyağı",
            "caption_draft": "Datça zeytinyağı hikayesi burada başlıyor.",
            "content_type": "instagram_post",
        },
        {
            "event_name": "Erken Hasat Zeytinyağı",
            "format": "post",
            "content_brief": "Premium early harvest olive oil launch scene with sunlit grove.",
            "photo_mood": "sunlit grove, golden hour",
        },
        plan_index=0,
        idea_index=0,
    )

    assert row["caption_draft"] == "Datça zeytinyağı hikayesi burada başlıyor."
    assert row["caption"] == "Datça zeytinyağı hikayesi burada başlıyor."
    assert row["content_brief"] == (
        "Premium early harvest olive oil launch scene with sunlit grove."
    )
