"""
CTA + caption language harmonization.

Brand default_ctas are often seeded in Turkish while content may be generated in
English (or vice versa). This module keeps caption, cta, and canva CTA fields
aligned to the brand's configured output language.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

_TR_FOLD = str.maketrans({
    "İ": "i", "I": "i", "ı": "i",
    "Ö": "o", "ö": "o",
    "Ü": "u", "ü": "u",
    "Ş": "s", "ş": "s",
    "Ç": "c", "ç": "c",
    "Ğ": "g", "ğ": "g",
})


def _normalize_cta_key(text: str) -> str:
    """ASCII-ish fold for CTA dictionary lookup (handles Turkish İ/ı)."""
    folded = text.strip().translate(_TR_FOLD).lower()
    decomposed = unicodedata.normalize("NFKD", folded)
    return "".join(c for c in decomposed if not unicodedata.combining(c))

_LANG_MAP = {
    "en": "English",
    "tr": "Turkish",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
}

# Canonical TR → EN (extend as needed)
_CTA_TR_TO_EN: dict[str, str] = {
    "hemen incele": "Explore now",
    "detayları incele": "See details",
    "detaylari incele": "See details",
    "rezervasyon yap": "Book now",
    "yerini ayırt": "Reserve your spot",
    "yerini ayirt": "Reserve your spot",
    "sipariş ver": "Order now",
    "siparis ver": "Order now",
    "iletişime geç": "Get in touch",
    "iletisime gec": "Get in touch",
    "bize katıl": "Join us",
    "bize katil": "Join us",
    "takip et": "Follow us",
    "bugün dene": "Try today",
    "bugun dene": "Try today",
    "menüyü gör": "View menu",
    "menuyu gor": "View menu",
    "kaçırma": "Don't miss out",
    "kacirma": "Don't miss out",
    "keşfet": "Discover",
    "kesfet": "Discover",
    "hemen rezervasyon": "Book now",
}

_CTA_EN_TO_TR: dict[str, str] = {
    "explore now": "Hemen incele",
    "learn more": "Detayları incele",
    "see details": "Detayları incele",
    "discover more": "Keşfet",
    "discover": "Keşfet",
    "book now": "Rezervasyon yap",
    "reserve now": "Rezervasyon yap",
    "reserve your spot": "Yerini ayırt",
    "order now": "Sipariş ver",
    "get in touch": "İletişime geç",
    "contact us": "İletişime geç",
    "join us": "Bize katıl",
    "follow us": "Takip et",
    "try today": "Bugün dene",
    "view menu": "Menüyü gör",
    "don't miss out": "Kaçırma",
    "dont miss out": "Kaçırma",
    "check it out": "Hemen incele",
}

_TURKISH_CHARS = set("çğıöşüÇĞİÖŞÜ")


def resolve_language_code(languages: str | None) -> str:
    raw = (languages or "tr").split(",")[0].strip().lower()
    if raw in _LANG_MAP:
        return raw
    if raw.startswith("eng"):
        return "en"
    if raw.startswith("tur") or raw == "türkçe":
        return "tr"
    return "en"


def resolve_output_language(languages: str | None) -> str:
    return _LANG_MAP.get(resolve_language_code(languages), "English")


def _strip_cta_phrases(text: str) -> str:
    """Remove known CTA phrases so they do not skew caption language detection."""
    cleaned = text
    for phrase in list(_CTA_TR_TO_EN.keys()) + list(_CTA_EN_TO_TR.keys()):
        pattern = re.compile(re.escape(phrase), re.IGNORECASE)
        cleaned = pattern.sub(" ", cleaned)
    return cleaned


def detect_text_language(text: str) -> str:
    """Rough heuristic: prefer word markers over Turkish chars in brand names."""
    if not text or not text.strip():
        return "en"
    raw = text.strip()
    norm_key = _normalize_cta_key(raw)
    if norm_key in _CTA_TR_TO_EN:
        return "tr"
    if norm_key in _CTA_EN_TO_TR:
        return "en"

    sample = _strip_cta_phrases(raw)
    lower = f" {sample.lower()} "

    en_markers = (
        " the ", " and ", " your ", " our ", " discover ", " why ", " for ",
        " with ", " real ", " about ", " guests ", " unforgettable ", " experiences ",
        " stories ", " smiles ", " this ", " that ", " you ", " we ",
    )
    en_hits = sum(1 for w in en_markers if w in lower)

    tr_markers = (" bir ", " ile ", " için ", " ve ", " bu ", " şimdi ", " hemen ", " kaçırma ")
    tr_hits = sum(1 for w in tr_markers if w in lower)
    tr_hits += sum(1 for w in _CTA_TR_TO_EN if w in _normalize_cta_key(sample))

    if en_hits >= 2 and tr_hits <= 1:
        return "en"
    if tr_hits >= 2 and en_hits <= 1:
        return "tr"

    if any(c in _TURKISH_CHARS for c in sample):
        tr_words = [
            w for w in re.findall(r"\b\w+\b", sample)
            if any(c in _TURKISH_CHARS for c in w)
        ]
        # Ignore capitalized proper nouns (e.g. Sarnıç Beach) when English markers present
        substantive_tr = [
            w for w in tr_words
            if w.lower() in _CTA_TR_TO_EN or (not w[0].isupper() and len(w) > 3)
        ]
        if substantive_tr or tr_hits >= 1:
            return "tr"
        if en_hits >= 1:
            return "en"
        return "tr"

    if en_hits >= 1:
        return "en"
    if tr_hits >= 1:
        return "tr"
    return "tr"


def localize_cta(cta: str, target_lang: str) -> str:
    cta = (cta or "").strip()
    if not cta:
        return cta
    key = _normalize_cta_key(cta)
    if target_lang == "en":
        if detect_text_language(cta) == "en":
            return cta
        return _CTA_TR_TO_EN.get(key, cta)
    if target_lang == "tr":
        if detect_text_language(cta) == "tr":
            return cta
        return _CTA_EN_TO_TR.get(key, cta)
    return cta


def localize_ctas(ctas: list[str], target_lang: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for c in ctas:
        loc = localize_cta(str(c), target_lang)
        if loc and loc.lower() not in seen:
            seen.add(loc.lower())
            out.append(loc)
    return out


def _replace_embedded_cta(text: str, old_cta: str, new_cta: str) -> str:
    if not text or not old_cta or not new_cta or _normalize_cta_key(old_cta) == _normalize_cta_key(new_cta):
        return text
    pattern = re.compile(re.escape(old_cta.strip()), re.IGNORECASE)
    if pattern.search(text):
        return pattern.sub(new_cta.strip(), text, count=1)
    old_words = old_cta.split()
    text_words = text.split()
    if not old_words:
        return text
    old_norm = [_normalize_cta_key(w) for w in old_words]
    for i in range(len(text_words) - len(old_words) + 1):
        window = text_words[i : i + len(old_words)]
        if [_normalize_cta_key(w) for w in window] == old_norm:
            text_words[i : i + len(old_words)] = [new_cta.strip()]
            return " ".join(text_words)
    return text


def harmonize_concept_copy(concept: dict[str, Any], languages: str | None) -> dict[str, Any]:
    """Align cta + caption fields to brand language; fix mixed-language captions."""
    target = resolve_language_code(languages)
    caption = str(concept.get("caption_draft") or concept.get("caption") or "")
    alt = str(concept.get("caption_draft_alt") or "")
    raw_cta = str(concept.get("cta") or concept.get("call_to_action") or "")

    # Brand language setting wins — never let detected caption language override tenant choice
    effective_lang = target

    old_cta = raw_cta
    new_cta = localize_cta(raw_cta, effective_lang) if raw_cta else raw_cta

    if new_cta:
        concept["cta"] = new_cta
        if old_cta and old_cta != new_cta:
            concept["caption_draft"] = _replace_embedded_cta(caption, old_cta, new_cta)
            concept["caption_draft_alt"] = _replace_embedded_cta(alt, old_cta, new_cta)
        elif caption and new_cta.lower() not in caption.lower():
            # Append CTA naturally if missing from caption body
            sep = " — " if effective_lang == "tr" else ". "
            if not caption.rstrip().endswith((".", "!", "?", "…")):
                concept["caption_draft"] = f"{caption.rstrip()}{sep}{new_cta}"
            else:
                concept["caption_draft"] = f"{caption.rstrip()} {new_cta}"

    canva = concept.get("canva_field_copy")
    if isinstance(canva, dict) and new_cta:
        canva = dict(canva)
        if canva.get("cta"):
            canva["cta"] = localize_cta(str(canva["cta"]), effective_lang)
        concept["canva_field_copy"] = canva

    return concept


def harmonize_content_concepts(
    concepts: list[dict[str, Any]],
    languages: str | None,
) -> list[dict[str, Any]]:
    return [harmonize_concept_copy(dict(c), languages) for c in concepts]
