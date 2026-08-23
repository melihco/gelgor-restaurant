from app.services.mission_ideation_merge import (
    _coerce_idea_index,
    _enrich_ideation_with_calendar_plan,
    _pick_ideation_for_calendar_strict,
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
    assert resolve_feed_package_total("seasonal", subscription_plan_slug="starter") == 16


def test_resolve_format_targets_switches_for_opportunity_and_starter() -> None:
    assert resolve_format_targets("opportunity") == {"story": 1, "post": 1, "reel": 1}
    assert resolve_format_targets("seasonal")["post"] == 5
    assert resolve_format_targets("seasonal")["story"] == 8
    assert resolve_format_targets("seasonal")["reel"] == 2
    starter = resolve_format_targets("seasonal", subscription_plan_slug="starter")
    assert starter == {"story": 8, "post": 5, "carousel": 1, "reel": 2}


def test_merge_ideation_ideas_hits_agency_format_targets_and_dedupes() -> None:
    stories = [idea(f"Story {i} unique", "story") for i in range(10)]
    posts = [idea(f"Post {i} unique", "post") for i in range(6)]
    ideas = [
        *stories,
        *posts,
        idea("Carousel unique", "carousel"),
        idea("Reel A unique", "reel"),
        idea("Reel B unique", "reel"),
        idea("Reel B unique", "reel"),  # duplicate by concept title
    ]

    merged = merge_ideation_ideas([ideas], mission_type="seasonal")

    assert len(merged) == 16
    assert sum(1 for x in merged if x["format"] == "story") == 8
    assert sum(1 for x in merged if x["format"] == "post") == 5
    assert sum(1 for x in merged if x["format"] == "carousel") == 1
    assert sum(1 for x in merged if x["format"] == "reel") == 2
    assert [x["concept_title"] for x in merged].count("Reel B unique") == 1


def test_merge_ideation_ideas_hits_starter_format_targets() -> None:
    stories = [idea(f"Story {i}", "story") for i in range(8)]
    posts = [idea(f"Post {i}", "post") for i in range(5)]
    ideas = [
        *stories,
        *posts,
        idea("Carousel", "carousel"),
        idea("Reel A", "reel"),
        idea("Reel B", "reel"),
    ]

    merged = merge_ideation_ideas(
        [ideas],
        mission_type="seasonal",
        subscription_plan_slug="starter",
    )

    assert len(merged) == 16
    assert sum(1 for x in merged if x["format"] == "post") == 5
    assert sum(1 for x in merged if x["format"] == "story") == 8
    assert sum(1 for x in merged if x["format"] == "reel") == 2


def test_merge_ideation_ideas_prefers_distinct_headlines_over_near_duplicates() -> None:
    ideas = [
        idea("Kahvaltı keyfi", "story"),
        idea("Kahvaltı keyfi başlıyor", "story"),  # near-duplicate of #1
        idea("Lezzet molası", "story"),
        idea("Şefin önerisi", "story"),
        idea("Akşam menüsü", "story"),
        idea("Gün batımı", "story"),
        idea("Teras molası", "story"),
        idea("Deniz esintisi", "story"),
        idea("Tatlı molası", "story"),
        idea("Brunch saati", "story"),
        idea("Post A unique", "post"),
        idea("Post B unique", "post"),
        idea("Post C unique", "post"),
        idea("Post D unique", "post"),
        idea("Post E unique", "post"),
        idea("Carousel unique", "carousel"),
        idea("Reel A unique", "reel"),
        idea("Reel B unique", "reel"),
    ]

    merged = merge_ideation_ideas([ideas], mission_type="seasonal")
    story_titles = [x["concept_title"] for x in merged if x["format"] == "story"]

    assert len(merged) == 16
    assert len(story_titles) == 8
    assert "Kahvaltı keyfi başlıyor" not in story_titles
    assert "Kahvaltı keyfi" in story_titles


def test_merge_ideation_ideas_preserves_count_when_only_near_duplicates() -> None:
    ideas = [
        idea("Kahvaltı", "story"),
        idea("Kahvaltı keyfi", "story"),
        idea("Kahvaltı keyfi başlıyor", "story"),
        idea("Post A unique", "post"),
        idea("Post B unique", "post"),
        idea("Carousel unique", "carousel"),
        idea("Reel A unique", "reel"),
    ]

    merged = merge_ideation_ideas([ideas], mission_type="seasonal")
    story_titles = [x["concept_title"] for x in merged if x["format"] == "story"]

    assert sum(1 for x in merged if x["format"] == "story") == 3
    assert len(merged) == 7
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


def test_calendar_enrichment_keeps_idea_copy_and_promotes_tagline() -> None:
    """Live regression (Karaman mission 4dc6a42e).

    The calendar agent emits `idea_index` as JSON text, so the explicit pairing
    was discarded and matching fell through to fuzzy title heuristics. Enrichment
    then wrote the calendar's planning label ("Kampanya Duyurusu") over the idea's
    publishable headline, and the quoted tagline never reached the canvas — so
    production sliced an overlay out of the caption instead.
    """
    ideas = [
        {"headline": "Doğanın Mucizesi Bir Kavanozda!", "caption_draft": "Zeytinyağı hikayesi."},
        {"headline": "Ücretsiz Kargo Fırsatı!", "caption_draft": "Kargo kampanyası."},
    ]
    plans = [
        {
            "event_name": "Erken Hasat Zeytinyağı",
            "tagline": "Doğanın en saf lezzeti şimdi sizlerle!",
            "idea_index": "0",
            "format": "post",
            "date": "2026-08-25",
        },
        {
            "event_name": "Kampanya Duyurusu",
            "tagline": "2500₺ üzeri tüm siparişlerde kargo ücretsiz!",
            "idea_index": "1",
            "format": "post",
            "date": "2026-08-26",
        },
    ]

    for plan_index, plan in enumerate(plans):
        picked, idea_index = _pick_ideation_for_calendar_strict(plan, ideas, set())
        assert idea_index == plan_index, "string idea_index must still join"
        row = _enrich_ideation_with_calendar_plan(picked, plan, plan_index, idea_index)

        expected_headline = ideas[plan_index]["headline"]
        assert row["headline"] == expected_headline
        assert row["concept_title"] == expected_headline
        assert row["tagline"] == plan["tagline"]
        # Overlay SSOT: the quoted line paints, the planning label may only support it.
        assert row["canva_field_copy"]["headline"] == plan["tagline"]
        assert row["canva_field_copy"]["subtitle"] == expected_headline


def test_coerce_idea_index_accepts_text_but_not_booleans() -> None:
    assert _coerce_idea_index("0") == 0
    assert _coerce_idea_index(" 12 ") == 12
    assert _coerce_idea_index(3) == 3
    assert _coerce_idea_index("second") is None
    assert _coerce_idea_index(None) is None
    assert _coerce_idea_index(True) is None
