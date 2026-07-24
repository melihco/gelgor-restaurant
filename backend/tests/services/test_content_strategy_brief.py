import json

from app.services.content_strategy_brief import (
    build_strategy_brief_for_downstream,
    parse_content_strategy_output,
)


def test_parse_content_strategy_output_requires_strategy_keys() -> None:
    assert parse_content_strategy_output(json.dumps({"weekly_theme": "Summer launch"})) == {
        "weekly_theme": "Summer launch"
    }
    assert parse_content_strategy_output(json.dumps({"foo": "bar"})) is None
    assert parse_content_strategy_output("") is None


def test_build_strategy_brief_formats_structured_payload() -> None:
    raw = json.dumps(
        {
            "weekly_theme": "Datca morning rituals",
            "mission_brief": "Push recurring breakfast and local product stories.",
            "pillar_mix": [
                {"pillar": "Product", "weight": 60, "reason": "Drive basket value"},
                {"name": "Local proof", "weight": 40},
            ],
            "recommended_formats": ["story", "reel"],
            "template_use_cases": ["morning_greeting"],
            "ready_for_gram_master": True,
        }
    )

    brief = build_strategy_brief_for_downstream(raw)

    assert "Weekly theme: Datca morning rituals" in brief
    assert "Mission brief:" in brief
    assert "- Product (60%): Drive basket value" in brief
    assert "Recommended formats:" in brief
    assert "- story" in brief


def test_build_strategy_brief_truncates_unstructured_raw_text() -> None:
    raw = "x" * 100

    assert build_strategy_brief_for_downstream(raw, max_chars=10) == "xxxxxxxxxx"


def test_build_strategy_brief_truncates_structured_markdown_with_ellipsis() -> None:
    raw = json.dumps(
        {
            "weekly_theme": "A" * 80,
            "mission_brief": "B" * 80,
        }
    )

    brief = build_strategy_brief_for_downstream(raw, max_chars=40)

    assert len(brief) <= 40
    assert brief.endswith("...")


def test_build_strategy_brief_empty_raw_returns_empty() -> None:
    assert build_strategy_brief_for_downstream(None) == ""
    assert build_strategy_brief_for_downstream("   ") == ""


def test_build_strategy_brief_handles_pillar_string_entries_and_notes() -> None:
    raw = json.dumps(
        {
            "weekly_theme": "Theme",
            "pillar_mix": ["Ambient", {"pillar": ""}],
            "strategy_notes": "Keep captions short",
            "recommended_formats": "story",
            "ready_for_gram_master": False,
        }
    )
    brief = build_strategy_brief_for_downstream(raw)
    assert "- Ambient" in brief
    assert "Strategy notes:" in brief
    assert "Keep captions short" in brief
    assert "Recommended formats:" in brief
    assert "not ready for Gram Master" in brief


def test_build_strategy_brief_surfaces_missing_question() -> None:
    raw = json.dumps(
        {
            "weekly_theme": "Theme",
            "missing_question": "Which SKU is hero this week?",
            "ready_for_gram_master": False,
        }
    )
    brief = build_strategy_brief_for_downstream(raw)
    assert "Open question" in brief
    assert "Which SKU is hero this week?" in brief
