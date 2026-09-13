"""Caption ↔ on-canvas headline.

Caption is the Instagram body. Headline is a complete on-canvas punchline
that shares the same claim. It must not be the caption's opening thought.
Empty / hollow / off-claim / opening-clone headlines fall back to a later
caption sentence, or stay empty.
"""

from __future__ import annotations

import re
from typing import Any

_SENTENCE_SPLIT = re.compile(r"[.!?\n—–]+")
_HASHTAG = re.compile(r"[#@]\S+")
_HOLLOW = re.compile(
    r"kutlayın|keşfedin|celebrate|tadını\s+çıkarın|her\s+şey\s+el\s+yapımı",
    re.IGNORECASE,
)
_WORD = re.compile(r"[a-z0-9]{4,}")


def _fold(text: str) -> str:
    folded = (text or "").replace("İ", "i").replace("I", "ı").lower()
    for src, dst in (("ı", "i"), ("ş", "s"), ("ğ", "g"),
                     ("ü", "u"), ("ö", "o"), ("ç", "c")):
        folded = folded.replace(src, dst)
    return folded


def _first_thought(caption: str) -> str:
    raw = _HASHTAG.sub("", (caption or "").strip())
    chunks = [part.strip() for part in _SENTENCE_SPLIT.split(raw) if part.strip()]
    return chunks[0].rstrip(".,;:") if chunks else ""


def caption_opens_with_headline(caption: str, headline: str) -> bool:
    h = _fold(headline).strip().rstrip(".,;:!?")
    first = _fold(_first_thought(caption)).strip().rstrip(".,;:!?")
    if len(h) < 4 or len(first) < 4:
        return False
    return first.startswith(h) or h.startswith(first)


def overlay_headline_from_caption(caption: str, max_len: int = 48) -> str:
    raw = _HASHTAG.sub("", (caption or "").strip())
    if len(raw) < 8:
        return ""
    chunks = [part.strip() for part in _SENTENCE_SPLIT.split(raw) if len(part.strip()) >= 8]
    later = next((part.rstrip(".,;:") for part in chunks[1:]), "")
    if not later:
        return ""
    if 8 <= len(later) <= max_len:
        return later
    return later[:max_len].rsplit(" ", 1)[0] if len(later) > max_len else later


def overlay_taken_from_caption(headline: str, caption: str) -> bool:
    h = re.sub(r"[^\w\s]", "", (headline or "").lower()).strip()
    c = re.sub(r"[^\w\s]", "", (caption or "").lower())
    return bool(h) and len(h) >= 8 and h in c


def overlay_headline_grounded(headline: str, caption: str) -> bool:
    if overlay_taken_from_caption(headline, caption):
        return True
    h_tokens = set(_WORD.findall(_fold(headline)))
    c_tokens = set(_WORD.findall(_fold(caption)))
    if not h_tokens or not c_tokens:
        return False
    overlap = h_tokens & c_tokens
    if not overlap:
        return False
    return len(overlap) >= min(2, len(h_tokens)) or (len(overlap) / len(h_tokens) >= 0.5)


def _is_incomplete_headline(headline: str) -> bool:
    h = (headline or "").strip()
    if len(h) < 8:
        return True
    words = [w for w in re.split(r"\s+", h) if w]
    return len(words) <= 1


def apply_caption_headline_pair(idea: dict[str, Any], max_len: int = 48) -> dict[str, Any]:
    """Keep a complete grounded punchline; never keep or fill the caption opening."""
    caption = str(idea.get("caption_draft") or idea.get("caption") or "").strip()
    current = str(idea.get("headline") or "").strip()
    line = overlay_headline_from_caption(caption, max_len)
    keep = (
        current
        and not _is_incomplete_headline(current)
        and not _HOLLOW.search(current)
        and overlay_headline_grounded(current, caption)
        and not caption_opens_with_headline(caption, current)
    )
    if keep:
        idea["headline"] = current[:max_len] if len(current) > max_len else current
        idea["overlay_headline_source"] = "brand_tone_line"
    elif line:
        idea["headline"] = line
        idea["overlay_headline_source"] = "caption_pair"
    else:
        return idea
    canva = idea.get("canva_field_copy")
    if not isinstance(canva, dict):
        canva = {}
    canva["headline"] = str(idea["headline"])[:47]
    idea["canva_field_copy"] = canva
    return idea
