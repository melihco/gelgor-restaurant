"""
Canvas Output Parser — safely parses Crew agent JSON into CanvasOutput shape.

Crew/LLM output is never guaranteed to be valid JSON or to contain all fields.
This parser applies graceful fallbacks so the layout renderer always receives
a structurally valid object.

Usage:
    ideas = parse_ideation_output(raw_llm_string)
    for idea in ideas:
        canvas_out = to_canvas_output(idea, layout_id="feed_square")
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

logger = structlog.get_logger()

# ── Layout selector — content_type + format → layout_id ──────────────────────

_LAYOUT_RULES: dict[str, str] = {
    "story":            "story_full",
    "reel":             "story_full",
    "carousel":         "carousel_slide",
    "event_announcement": "event_card",
    "event_card":       "event_card",
    "weekly_brief":     "weekly_brief",
    "weekly_performance": "weekly_brief",
    "review_showcase":  "review_showcase",
    "social_proof":     "review_showcase",
    "ad_banner":        "ad_banner_horizontal",
    "campaign_offer":   "feed_square",
    "menu_share":       "feed_square",
    "product_highlight": "feed_square",
    "service_showcase": "feed_square",
    "daily_story":      "story_full",
    "educational_post": "feed_square",
}

_DEFAULT_LAYOUT = "feed_square"


def select_layout_id(content_type: str, format_hint: str = "feed") -> str:
    """
    Deterministic layout selection (no LLM involvement).
    Priority: format_hint → content_type → default.
    """
    fmt = (format_hint or "").lower()
    if fmt in ("story", "reel"):
        return "story_full"
    if fmt == "carousel":
        return "carousel_slide"

    ctype = (content_type or "").lower().replace(" ", "_")
    return _LAYOUT_RULES.get(ctype, _DEFAULT_LAYOUT)


# ── JSON extraction helpers ───────────────────────────────────────────────────

def _extract_json_array(text: str) -> list[dict]:
    """Try to extract a JSON array from raw LLM output."""
    # Try direct parse
    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, list):
            return [d for d in parsed if isinstance(d, dict)]
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    # Find the outermost [...] block
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                return [d for d in parsed if isinstance(d, dict)]
        except json.JSONDecodeError:
            pass

    # Find individual {...} blocks
    blocks = re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}", text, re.DOTALL)
    results = []
    for block in blocks:
        try:
            obj = json.loads(block)
            if isinstance(obj, dict):
                results.append(obj)
        except json.JSONDecodeError:
            continue
    return results


def _safe_str(obj: Any, key: str, default: str = "") -> str:
    val = obj.get(key, default)
    return str(val).strip() if val else default


def _safe_list(obj: Any, key: str) -> list[str]:
    val = obj.get(key, [])
    if isinstance(val, list):
        return [str(v) for v in val if v]
    if isinstance(val, str):
        return [val] if val else []
    return []


# ── CanvasOutput dict builder ─────────────────────────────────────────────────

def to_canvas_output(idea: dict, layout_id: str | None = None) -> dict:
    """
    Normalize a single idea dict into a CanvasOutput-compatible dict.
    All fields have safe defaults — never raises.
    """
    content_type = _safe_str(idea, "content_type") or _safe_str(idea, "type") or "social_post"
    format_hint = _safe_str(idea, "format") or _safe_str(idea, "post_format") or "feed"

    resolved_layout = layout_id or select_layout_id(content_type, format_hint)

    # Caption — try multiple field names agents may use
    caption = (
        _safe_str(idea, "caption_draft")
        or _safe_str(idea, "caption")
        or _safe_str(idea, "content")
        or ""
    )

    headline = (
        _safe_str(idea, "headline")
        or _safe_str(idea, "title")
        or caption[:60]
    )

    # Gallery URL hint from agent
    gallery_url = (
        _safe_str(idea, "selected_gallery_url")
        or _safe_str(idea, "gallery_url")
        or _safe_str(idea, "image_url")
        or None
    ) or None

    # Visual brief
    visual_treatment = (
        _safe_str(idea, "visual_direction")
        or _safe_str(idea, "image_treatment")
        or _safe_str(idea, "visual_brief")
        or "use best matching gallery photo"
    )

    # Bullets
    bullets = _safe_list(idea, "bullets") or _safe_list(idea, "key_points")

    # Posting time
    posting_time = (
        _safe_str(idea, "posting_time_suggestion")
        or _safe_str(idea, "posting_time")
        or _safe_str(idea, "suggested_date")
        or ""
    )

    return {
        "headline": headline[:60],
        "subline": _safe_str(idea, "subline")[:120],
        "bullets": bullets[:4],
        "caption": caption,
        "cta": _safe_str(idea, "cta")[:40],
        "hashtags": _safe_str(idea, "hashtags"),
        "layoutId": resolved_layout,
        "postingTimeSuggestion": posting_time,
        "contentType": content_type,
        "format": format_hint if format_hint in ("feed", "story", "reel", "carousel") else "feed",
        "visualBrief": {
            "treatment": visual_treatment,
            "galleryUrl": gallery_url,
            "shotType": _safe_str(idea, "shot_type") or "environmental",
            "includePeople": bool(idea.get("include_people", False)),
        },
        "tokensHint": {
            "primaryColor": idea.get("tokens_hint", {}).get("primary_color") if isinstance(idea.get("tokens_hint"), dict) else None,
            "overlayOpacity": idea.get("tokens_hint", {}).get("overlay_opacity") if isinstance(idea.get("tokens_hint"), dict) else None,
            "typographyWeight": idea.get("tokens_hint", {}).get("typography_weight") if isinstance(idea.get("tokens_hint"), dict) else None,
        },
        "ideaTitle": _safe_str(idea, "idea_title") or _safe_str(idea, "title") or headline,
        "brandConfidence": float(idea.get("brand_confidence", 0.8)),
        "antiPatternFlags": _safe_list(idea, "anti_pattern_flags"),
    }


def parse_ideation_output(raw_output: str) -> list[dict]:
    """
    Parse the raw string output of a content_ideation Crew task into
    a list of CanvasOutput-compatible dicts.

    Returns an empty list (never raises) on complete parse failure.
    """
    if not raw_output or not raw_output.strip():
        return []

    try:
        ideas = _extract_json_array(raw_output)
        if not ideas:
            logger.warning("canvas_output_parser_no_json", raw_len=len(raw_output))
            return []

        results = [to_canvas_output(idea) for idea in ideas]
        logger.info("canvas_output_parsed", idea_count=len(results))
        return results

    except Exception as exc:
        logger.error("canvas_output_parser_failed", error=str(exc)[:200])
        return []
