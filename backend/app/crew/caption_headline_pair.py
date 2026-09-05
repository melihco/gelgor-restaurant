"""Caption → on-canvas headline pair.

The caption writer is the only copy source. Overlay headline is the spoken
opening thought of that caption — not a second slogan invented later.
"""

from __future__ import annotations

import re
from typing import Any

_SENTENCE_SPLIT = re.compile(r"[.!?\n]+")
_HASHTAG = re.compile(r"[#@]\S+")


def overlay_headline_from_caption(caption: str, max_len: int = 48) -> str:
    raw = _HASHTAG.sub("", (caption or "").strip())
    if len(raw) < 8:
        return ""
    chunks = [part.strip() for part in _SENTENCE_SPLIT.split(raw) if len(part.strip()) >= 8]
    if not chunks:
        return ""
    first = chunks[0].rstrip(".,;:")
    if 8 <= len(first) <= max_len:
        return first
    return first[:max_len].rsplit(" ", 1)[0] if len(first) > max_len else first


def overlay_taken_from_caption(headline: str, caption: str) -> bool:
    h = re.sub(r"[^\w\s]", "", (headline or "").lower()).strip()
    c = re.sub(r"[^\w\s]", "", (caption or "").lower())
    return bool(h) and len(h) >= 8 and h in c


def apply_caption_headline_pair(idea: dict[str, Any], max_len: int = 48) -> dict[str, Any]:
    """Force headline + canva headline to the caption's opening thought."""
    caption = str(idea.get("caption_draft") or idea.get("caption") or "").strip()
    line = overlay_headline_from_caption(caption, max_len)
    if not line:
        return idea
    current = str(idea.get("headline") or "").strip()
    if not overlay_taken_from_caption(current, caption):
        idea["headline"] = line
    else:
        idea["headline"] = current[:max_len]
    canva = idea.get("canva_field_copy")
    if not isinstance(canva, dict):
        canva = {}
    canva["headline"] = str(idea["headline"])[:47]
    idea["canva_field_copy"] = canva
    idea["overlay_headline_source"] = "caption_pair"
    return idea
