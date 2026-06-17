"""
Parse visual_design_cards mission node outputs for auto-produce.

Mirrors apps/web/src/lib/mission-visual-design-cards.ts (parseMissionVisualDesignCards).
"""

from __future__ import annotations

import json
import re
from typing import Any

_MAX_CARDS = 8


def _extract_json_array(text: str) -> list[dict[str, Any]]:
    trimmed = text.strip()
    trimmed = re.sub(r"^```(?:json)?\s*", "", trimmed, flags=re.IGNORECASE)
    trimmed = re.sub(r"\s*```\s*$", "", trimmed)
    try:
        parsed = json.loads(trimmed)
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
    except Exception:
        pass
    match = re.search(r"\[[\s\S]*\]", trimmed)
    if not match:
        return []
    try:
        parsed = json.loads(match.group())
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
    except Exception:
        return []
    return []


def _to_card(item: dict[str, Any]) -> dict[str, Any] | None:
    prompt = str(item.get("image_generation_prompt") or "").strip()
    headline = str(
        item.get("headline") or item.get("concept_title") or item.get("title") or ""
    ).strip()
    if not prompt and not headline:
        return None

    card: dict[str, Any] = {}
    for key in (
        "card_type",
        "format",
        "concept_title",
        "background_reference_url",
        "background_intent",
        "overlay_color",
        "headline",
        "subline",
        "cta_text",
        "cta_style",
        "cta_color",
        "text_color",
        "typography_style",
        "logo_position",
        "visual_mood",
        "strategic_purpose",
        "photo_url",
        "accent_color",
        "primary_color",
    ):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            card[key] = val.strip()

    if prompt:
        card["image_generation_prompt"] = prompt
    elif headline:
        card["headline"] = headline

    opacity = item.get("overlay_opacity")
    if isinstance(opacity, (int, float, str)) and str(opacity).strip():
        card["overlay_opacity"] = opacity

    mapping = item.get("canva_field_mapping")
    if isinstance(mapping, (dict, str)):
        card["canva_field_mapping"] = mapping

    canvas = item.get("canvas_spec")
    if isinstance(canvas, dict):
        card["canvas_spec"] = canvas

    return card


def parse_mission_visual_design_cards(
    output_summary: str | None,
) -> list[dict[str, Any]]:
    if not output_summary or not str(output_summary).strip():
        return []
    cards: list[dict[str, Any]] = []
    for item in _extract_json_array(str(output_summary)):
        card = _to_card(item)
        if card:
            cards.append(card)
    return cards[:_MAX_CARDS]


def parse_visual_design_cards_from_nodes(
    nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge completed visual_design_cards nodes (same order as reproduce-feed BFF)."""
    merged: list[dict[str, Any]] = []
    for node in nodes:
        if node.get("task_type") != "visual_design_cards":
            continue
        if node.get("status") != "completed":
            continue
        summary = node.get("output_summary") or ""
        merged.extend(parse_mission_visual_design_cards(str(summary)))
    return merged[:_MAX_CARDS]
