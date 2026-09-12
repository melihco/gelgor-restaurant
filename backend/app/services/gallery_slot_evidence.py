"""Drop catalog slots the gallery cannot prove — before the ideation LLM.

Sector-agnostic: tokens come from the slot key / label and the gallery
analysis the brand already has. No tenant UUID, no harvest vocabulary.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.slot_purpose import catalog_slot_purpose_key

_WORD = re.compile(r"[a-z0-9]{3,}")

# Format / routing noise — not a product harvest list.
_NOISE = {
    "shop",
    "club",
    "local",
    "products",
    "instagram",
    "campaign",
    "organic",
    "beach",
    "cafe",
    "restaurant",
    "beauty",
    "wellness",
    "hotel",
    "hospitality",
    "post",
    "story",
    "reel",
    "carousel",
    "offer",
    "experience",
    "showcase",
    "editorial",
    "premium",
    "package",
    "the",
    "and",
    "for",
}

# Place-generic jobs a venue/product photo can still carry.
_PLACE_GENERIC = {
    "lobby",
    "terrace",
    "breakfast",
    "ambiance",
    "atmosphere",
    "checkin",
    "dining",
    "garden",
    "sunset",
    "beach",
    "view",
    "hours",
    "guest",
    "weekend",
    "local",
    "seasonal",
    "amenities",
    "property",
    "escape",
    "review",
    "hero",
    "favorite",
    "arrival",
    "range",
    "detail",
    "shop",
    "interior",
    "lawn",
    "pier",
}


def _fold(text: str) -> str:
    folded = (text or "").replace("İ", "i").replace("I", "ı").lower()
    for src, dst in (("ı", "i"), ("ş", "s"), ("ğ", "g"),
                     ("ü", "u"), ("ö", "o"), ("ç", "c")):
        folded = folded.replace(src, dst)
    return folded


def _tokens(text: str) -> set[str]:
    return {m.group(0) for m in _WORD.finditer(_fold(text))} - _NOISE


def gallery_evidence_tokens(gallery_analysis: Any) -> set[str]:
    data = gallery_analysis
    if isinstance(data, str):
        raw = data.strip()
        if not raw:
            return set()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return _tokens(raw)
    if not isinstance(data, dict) or not data:
        return set()

    bag: set[str] = set()
    for url, meta in data.items():
        bag |= _tokens(str(url))
        if not isinstance(meta, dict):
            continue
        for key in (
            "description",
            "usageContext",
            "mood",
            "suggestedAssetType",
            "primarySubject",
        ):
            bag |= _tokens(str(meta.get(key) or ""))
        for list_key in (
            "contentTags",
            "bestFor",
            "captionHooks",
            "pairingKeywords",
        ):
            values = meta.get(list_key) or []
            if isinstance(values, list):
                for item in values:
                    bag |= _tokens(str(item))
    return bag


def slot_evidence_tokens(slot: dict[str, str]) -> set[str]:
    key = str(slot.get("slot_key") or "")
    label = str(slot.get("label_tr") or slot.get("label_en") or "")
    purpose = catalog_slot_purpose_key(key)
    return _tokens(f"{purpose} {label}")


def gallery_can_prove_slot(
    slot: dict[str, str],
    gallery_tokens: set[str],
    *,
    has_photos: bool,
) -> bool:
    if not has_photos:
        return False
    needed = slot_evidence_tokens(slot)
    if not needed:
        return True
    if needed & gallery_tokens:
        return True
    if needed <= _PLACE_GENERIC or (needed & _PLACE_GENERIC):
        return True
    return False


def prefer_gallery_proven_slots(
    catalog_slots: list[dict[str, str]],
    gallery_analysis: Any,
) -> list[dict[str, str]]:
    """Keep slots the gallery can prove. Empty result → caller keeps the original list."""
    if not catalog_slots:
        return []
    tokens = gallery_evidence_tokens(gallery_analysis)
    if not tokens:
        return []
    proven = [
        slot
        for slot in catalog_slots
        if gallery_can_prove_slot(slot, tokens, has_photos=True)
    ]
    return proven
