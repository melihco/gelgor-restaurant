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


# Job family of a catalog slot — mirrors apps/web/src/lib/look-job-kind.ts.
# A place / process slot needs a photo *family*, not a generic token: 77 jar
# shots and one logo cannot carry "dükkan atmosferi", whatever the label says.
_PLACE_RE = re.compile(
    r"ambiance|atmosphere|venue|sunset|market_day|shop_tour|shop_interior|weekend|hours|saat"
    r"|lawn|pier|terrace|garden|atmosfer|pazar|dukkan|gun batim|semsiye|sezlong|interior",
)
_PROCESS_RE = re.compile(
    r"process|bts|farm_visit|craft|atolye|uretim|surec|kulis|ciftlik|behind|hasat|harvest",
)

_VENUE_ASSET_TYPES = {
    "venue_reference", "venue_photo", "event_photo", "team_photo", "hero_image",
    "interior", "exterior", "ambiance", "venue",
}
_VENUE_TOKENS = {
    "venue", "interior", "exterior", "dukkan", "mekan", "tezgah", "raf", "vitrin",
    "salon", "teras", "terrace", "garden", "bahce", "pazar", "market", "tabela",
    "cephe", "masa", "lobby", "lobi", "koridor", "avlu", "plaj", "beach", "havuz",
    "pool", "sunset", "gunbatimi", "lawn", "pier", "iskele", "sezlong", "semsiye",
}
_PROCESS_ASSET_TYPES = {"process", "behind_the_scenes", "bts", "team_photo", "event_photo"}
_PROCESS_TOKENS = {
    "uretim", "atolye", "hasat", "harvest", "ciftlik", "farm", "process", "craft",
    "kulis", "behind", "imalat", "usta", "tarla", "workshop", "kitchen", "mutfak",
}


def slot_job_family(slot: dict[str, str]) -> str:
    """'place' | 'process' | 'other' from slot key + purpose (no brand words)."""
    key = _fold(str(slot.get("slot_key") or ""))
    purpose = _fold(catalog_slot_purpose_key(str(slot.get("slot_key") or "")))
    bag = f"{key} {purpose}"
    if _PLACE_RE.search(bag):
        return "place"
    if _PROCESS_RE.search(bag):
        return "process"
    return "other"


def gallery_evidence_families(gallery_analysis: Any) -> set[str]:
    """{'venue', 'process'} families the gallery actually contains (per-photo, not bag-of-words)."""
    data = gallery_analysis
    if isinstance(data, str):
        raw = data.strip()
        if not raw:
            return set()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return set()
    if not isinstance(data, dict):
        return set()
    families: set[str] = set()
    for meta in data.values():
        if not isinstance(meta, dict):
            continue
        asset = _fold(str(meta.get("suggestedAssetType") or ""))
        best_for = {_fold(str(x)) for x in (meta.get("bestFor") or []) if isinstance(x, str)}
        photo_tokens = _tokens(
            " ".join(
                str(meta.get(k) or "") for k in ("description", "primarySubject", "usageContext")
            )
            + " "
            + " ".join(str(x) for x in (meta.get("contentTags") or []) if isinstance(x, str)),
        )
        if asset in _VENUE_ASSET_TYPES or (best_for & _VENUE_ASSET_TYPES) or (photo_tokens & _VENUE_TOKENS):
            families.add("venue")
        if asset in _PROCESS_ASSET_TYPES or (best_for & _PROCESS_ASSET_TYPES) or (photo_tokens & _PROCESS_TOKENS):
            families.add("process")
    return families


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
    families: set[str] | None = None,
) -> bool:
    if not has_photos:
        return False
    needed = slot_evidence_tokens(slot)
    if not needed:
        return True
    family = slot_job_family(slot)
    if families is not None and family in ("place", "process"):
        # Coverage gate: a place job opens only with a venue-family photo, a
        # process job only with a process-family photo. Generic tokens
        # ("ambiance", "weekend") never stand in for the missing photo; a
        # specific slot word found on a photo ("sunset", "pazar") still counts.
        required = "venue" if family == "place" else "process"
        if required in families:
            return True
        return bool((needed - _PLACE_GENERIC) & gallery_tokens)
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
    families = gallery_evidence_families(gallery_analysis)
    proven = [
        slot
        for slot in catalog_slots
        if gallery_can_prove_slot(slot, tokens, has_photos=True, families=families)
    ]
    return proven
