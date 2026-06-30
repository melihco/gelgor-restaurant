"""
Structured extract of content_strategy node output for downstream agents.

Avoids blind truncation of raw JSON — ideation, calendar, and Feed Art Director
receive weekly_theme, pillar_mix, and format guidance intact.
"""

from __future__ import annotations

from typing import Any

from app.services.output_summary_parser import extract_structured_payload_from_output_summary

STRATEGY_BRIEF_MAX_CHARS = 4000
STRATEGY_MEMORY_PREVIEW_MAX_CHARS = 900


def parse_content_strategy_output(raw: str | None) -> dict[str, Any] | None:
    if not raw or len(raw.strip()) < 2:
        return None
    payload = extract_structured_payload_from_output_summary(raw)
    if not isinstance(payload, dict):
        return None
    if not any(
        payload.get(key)
        for key in ("weekly_theme", "mission_brief", "brief", "pillar_mix")
    ):
        return None
    return payload


def _format_pillar_mix(pillar_mix: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(pillar_mix, list):
        return lines
    for entry in pillar_mix[:10]:
        if isinstance(entry, dict):
            pillar = str(entry.get("pillar") or entry.get("name") or "?").strip()
            weight = entry.get("weight")
            reason = str(entry.get("reason") or "").strip()
            weight_s = f" ({weight}%)" if weight is not None else ""
            suffix = f": {reason}" if reason else ""
            lines.append(f"- {pillar}{weight_s}{suffix}")
        elif entry:
            lines.append(f"- {entry}")
    return lines


def _format_string_list(label: str, value: Any) -> list[str]:
    if not value:
        return []
    lines = [f"{label}:"]
    if isinstance(value, list):
        for item in value[:14]:
            text = str(item).strip()
            if text:
                lines.append(f"- {text}")
    else:
        lines.append(str(value).strip())
    return lines


def build_strategy_brief_for_downstream(
    raw: str | None,
    *,
    max_chars: int = STRATEGY_BRIEF_MAX_CHARS,
) -> str:
    """Compact markdown block for ideation/calendar/FD prompts."""
    if not raw or not raw.strip():
        return ""

    data = parse_content_strategy_output(raw)
    if not data:
        trimmed = raw.strip()
        return trimmed[:max_chars] if len(trimmed) > max_chars else trimmed

    lines: list[str] = []

    weekly_theme = str(data.get("weekly_theme") or "").strip()
    if weekly_theme:
        lines.append(f"Weekly theme: {weekly_theme}")

    mission_brief = str(data.get("mission_brief") or data.get("brief") or "").strip()
    if mission_brief:
        if lines:
            lines.append("")
        lines.append("Mission brief:")
        lines.append(mission_brief)

    pillar_lines = _format_pillar_mix(data.get("pillar_mix"))
    if pillar_lines:
        if lines:
            lines.append("")
        lines.append("Pillar mix:")
        lines.extend(pillar_lines)

    for label, key in (
        ("Recommended formats", "recommended_formats"),
        ("Template use cases", "template_use_cases"),
        ("Asset intents", "asset_intents"),
        ("Strategy notes", "strategy_notes"),
    ):
        block = _format_string_list(label, data.get(key))
        if block:
            if lines:
                lines.append("")
            lines.extend(block)

    ready = data.get("ready_for_gram_master")
    missing = str(data.get("missing_question") or "").strip()
    if missing:
        if lines:
            lines.append("")
        lines.append(f"Open question (resolve before ideation if critical): {missing}")
    elif ready is False:
        if lines:
            lines.append("")
        lines.append("Strategy flagged not ready for Gram Master — align ideas with mission brief only.")

    text = "\n".join(lines).strip()
    if len(text) > max_chars:
        return text[: max_chars - 3].rstrip() + "..."
    return text
