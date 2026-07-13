from app.services.output_summary_parser import (
    extract_object_array_from_output_summary,
    extract_structured_payload_from_output_summary,
    strip_markdown_code_fences,
)


def test_strip_markdown_code_fences_handles_json_fence() -> None:
    assert strip_markdown_code_fences("```json\n{\"ok\": true}\n```") == '{"ok": true}'


def test_extract_object_array_from_raw_array_filters_non_objects() -> None:
    result = extract_object_array_from_output_summary('[{"title":"A"}, "noise", {"title":"B"}]')

    assert result == [{"title": "A"}, {"title": "B"}]


def test_extract_object_array_from_root_keys() -> None:
    raw = '{"content_ideas":[{"title":"A"}], "other": []}'

    assert extract_object_array_from_output_summary(raw) == [{"title": "A"}]


def test_extract_object_array_scans_embedded_json_array() -> None:
    raw = 'LLM preface\n[{"title":"A"}, {"title":"B"}]\nLLM footer'

    assert extract_object_array_from_output_summary(raw) == [{"title": "A"}, {"title": "B"}]


def test_extract_object_array_returns_largest_embedded_candidate() -> None:
    raw = 'small [{"title":"A"}] big [{"title":"B"}, {"title":"C"}]'

    assert extract_object_array_from_output_summary(raw) == [{"title": "B"}, {"title": "C"}]


def test_extract_object_array_recovers_truncated_json_array() -> None:
    # Missing closing bracket + incomplete last object — production summarizer cap.
    raw = (
        '[{"headline":"A","caption_draft":"one"},'
        '{"headline":"B","caption_draft":"two"},'
        '{"headline":"C","caption_draft":"partial'
    )
    result = extract_object_array_from_output_summary(raw)
    assert [row["headline"] for row in result] == ["A", "B"]


def test_extract_structured_payload_returns_object() -> None:
    payload = extract_structured_payload_from_output_summary('{"weekly_theme":"Morning"}')

    assert payload == {"weekly_theme": "Morning"}


def test_extract_structured_payload_returns_embedded_object() -> None:
    payload = extract_structured_payload_from_output_summary('before {"weekly_theme":"Morning"} after')

    assert payload == {"weekly_theme": "Morning"}


def test_extract_structured_payload_prefers_array_in_embedded_object_root_key() -> None:
    payload = extract_structured_payload_from_output_summary('text {"ideas":[{"title":"A"}]} text')

    assert payload == [{"title": "A"}]


def test_extract_structured_payload_returns_none_for_too_short_or_invalid() -> None:
    assert extract_structured_payload_from_output_summary("") is None
    assert extract_structured_payload_from_output_summary("x") is None
