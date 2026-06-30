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
