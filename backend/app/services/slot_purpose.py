"""Catalog slot purpose — caption must speak the slot's job.

Sector-agnostic: rules key off the purpose stem after the sector prefix
(`local_products_shop_weekend_hours_story` → `weekend_hours_story`).
No tenant UUIDs or brand names.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.crew.caption_headline_pair import apply_caption_headline_pair
from app.data.sector_slot_pack import SECTOR_SLOT_PACKS

_HASHTAG = re.compile(r"[#@]\S+")


def _fold(text: str) -> str:
    folded = (text or "").replace("İ", "i").replace("I", "ı").lower()
    for src, dst in (("ı", "i"), ("ş", "s"), ("ğ", "g"),
                     ("ü", "u"), ("ö", "o"), ("ç", "c")):
        folded = folded.replace(src, dst)
    return folded


def catalog_slot_purpose_key(slot_key: str) -> str:
    key = (slot_key or "").lower().strip()
    if not key:
        return ""
    best = ""
    for pack in SECTOR_SLOT_PACKS:
        prefix = f"{pack['sector_id'].lower()}_"
        if key.startswith(prefix) and len(prefix) > len(best):
            best = prefix
    return key[len(best):] if best else key


# (purpose-stem regex, folded required tokens, job_tr, job_en, opening_tr, opening_en)
_PURPOSE_RULES: list[tuple[str, tuple[str, ...], str, str, str, str]] = [
    (
        r"weekend_hours|opening_hours",
        ("saat", "acik", "cumartesi", "pazar", "hours", "open", "hafta"),
        "Hafta sonu / çalışma saatini söyle — kaçta açık olduğunuzu.",
        "Say the weekend / opening hours — when you are open.",
        "Hafta sonu dükkanımız açık.",
        "We're open this weekend.",
    ),
    (
        r"weekend_booking|weekend_availability",
        ("saat", "acik", "rezerv", "booking", "hafta", "musait"),
        "Hafta sonu müsaitlik veya rezervasyonu söyle.",
        "Say weekend availability or the booking ask.",
        "Hafta sonu yerinizi ayırtın.",
        "Book your weekend table.",
    ),
    (
        r"customer_favorite|guest_social|client_testimonial|member_story|social_proof",
        ("musteri", "yorum", "seviyor", "favori", "tadim", "review", "testimonial", "misafir"),
        "Gerçek bir müşteri / misafir sesi — yorum, tadım, favori.",
        "A real guest voice — review, tasting, favorite.",
        "Müşterilerimiz bunu çok seviyor.",
        "Our guests keep coming back for this.",
    ),
    (
        r"farm_visit|farm.?to.?table|orchard|grove|producer_visit",
        ("ciftlik", "hasat", "bahce", "zeytinlik", "orchard", "farm", "grove", "uretici"),
        "Çiftlik, bahçe, hasat veya üretici ziyareti — raftaki ürün satışı değil.",
        "Farm, orchard, harvest or producer visit — not a shelf sale.",
        "Çiftlikte hasat devam ediyor.",
        "Harvest is underway at the farm.",
    ),
    (
        r"production_bts|craft_process|behind_scenes|kitchen_bts",
        ("uretim", "surec", "hazirlan", "atolye", "kulis", "craft", "bts", "mutfak"),
        "Üretim / mutfak kulisini göster — genel 'lezzetler sizi bekliyor' değil.",
        "Show the making — not a generic 'flavors await you' line.",
        "Üretimde bugün iş başındayız.",
        "Today we are in production.",
    ),
    (
        r"gift_bundle|gift_set|hamper|hediye",
        ("hediye", "set", "paket", "bundle", "gift", "hamper"),
        "Hediye seti / paket — tek SKU satışı değil.",
        "A gift set or bundle — not a single SKU pitch.",
        "Hediye setlerimiz hazır.",
        "Gift sets are ready.",
    ),
    (
        r"new_arrival",
        ("yeni", "geldi", "rafta", "arrival"),
        "Yeni gelen ürünü söyle.",
        "Name what just arrived.",
        "Yeni gelenler rafta.",
        "New arrivals are on the shelf.",
    ),
    (
        r"limited_batch",
        ("sinirli", "parti", "stok", "tuken", "batch", "limited"),
        "Sınırlı parti / stok gerçeğini söyle.",
        "Say it is a limited batch.",
        "Bu parti sınırlı.",
        "This batch is limited.",
    ),
    (
        r"market_day",
        ("pazar", "tezgah", "stand", "market"),
        "Pazar / tezgah gününü söyle.",
        "Say it is market-stand day.",
        "Pazar tezgahındayız.",
        "We are at the market stand.",
    ),
    (
        r"reservation_cta|reservation_reminder|reservation_exclusive|booking",
        ("rezerv", "booking", "randevu", "yerinizi", "masa"),
        "Rezervasyon veya randevu çağrısı.",
        "Ask for the booking or appointment.",
        "Yerinizi ayırtın.",
        "Reserve your table.",
    ),
]


def resolve_slot_purpose(slot_key: str) -> dict[str, Any] | None:
    purpose = catalog_slot_purpose_key(slot_key)
    if not purpose:
        return None
    for pattern, tokens, job_tr, job_en, open_tr, open_en in _PURPOSE_RULES:
        if re.search(pattern, purpose):
            return {
                "purpose": purpose,
                "tokens": list(tokens),
                "job_tr": job_tr,
                "job_en": job_en,
                "opening_tr": open_tr,
                "opening_en": open_en,
            }
    return None


def slot_purpose_tokens(slot_key: str) -> list[str]:
    rule = resolve_slot_purpose(slot_key)
    return list(rule["tokens"]) if rule else []


def slot_purpose_job(slot_key: str, language: str = "Turkish") -> str:
    rule = resolve_slot_purpose(slot_key)
    if not rule:
        return ""
    turkish = language.lower().startswith("tr") or language == "Turkish"
    return str(rule["job_tr"] if turkish else rule["job_en"])


def caption_hits_slot_purpose(caption: str, slot_key: str) -> bool:
    rule = resolve_slot_purpose(slot_key)
    if not rule:
        return True
    folded = _fold(_HASHTAG.sub("", caption or ""))
    if not folded.strip():
        return False
    for token in rule["tokens"]:
        if len(token) >= 4:
            if re.search(rf"(?<![0-9a-z]){re.escape(token)}[a-z]*", folded):
                return True
        elif re.search(rf"(?<![0-9a-z]){re.escape(token)}(?![0-9a-z])", folded):
            return True
    return False


def _review_opening(brand: Any, turkish: bool) -> str:
    signals = getattr(brand, "google_review_signals", None) or []
    for row in signals:
        if not isinstance(row, dict):
            continue
        text = str(row.get("text") or "").strip()
        if len(text) < 16:
            continue
        clause = re.split(r"[.!?\n]", text, maxsplit=1)[0].strip().rstrip(".,;:")
        if 16 <= len(clause) <= 80:
            return clause
    return "Müşterilerimiz bunu çok seviyor." if turkish else "Our guests keep coming back for this."


def _purpose_opening(slot_key: str, brand: Any, turkish: bool) -> str:
    rule = resolve_slot_purpose(slot_key)
    if not rule:
        return ""
    if re.search(r"customer_favorite|guest_social|client_testimonial|member_story|social_proof",
                 rule["purpose"]):
        return _review_opening(brand, turkish)
    return str(rule["opening_tr"] if turkish else rule["opening_en"])


def align_idea_to_slot_purpose(idea: dict[str, Any], brand: Any = None) -> bool:
    """If caption misses the claimed slot job, prepend a spoken purpose line.

    Returns True when copy was rewritten. Re-pairs headline afterwards.
    """
    if not isinstance(idea, dict):
        return False
    key = str(idea.get("catalog_slot_key") or idea.get("catalogSlotKey") or "").strip()
    if not key or not resolve_slot_purpose(key):
        return False
    caption = str(idea.get("caption_draft") or idea.get("caption") or "").strip()
    if caption_hits_slot_purpose(caption, key):
        apply_caption_headline_pair(idea)
        return False

    lang = ""
    if brand is not None:
        lang = str(getattr(brand, "languages", "") or "")
    turkish = not lang or lang.lower().startswith("tr")
    opening = _purpose_opening(key, brand, turkish)
    if not opening:
        return False
    rest = _HASHTAG.sub("", caption).strip()
    if rest.lower().startswith(opening.lower()):
        idea["caption_draft"] = rest
        idea["caption"] = rest
    else:
        joined = f"{opening} {rest}".strip() if rest else opening
        idea["caption_draft"] = joined
        idea["caption"] = joined
    apply_caption_headline_pair(idea)
    idea["slot_purpose_aligned"] = True
    return True


def align_ideas_to_slot_purpose(ideas: list[Any], brand: Any = None) -> int:
    n = 0
    for idea in ideas:
        if isinstance(idea, dict) and align_idea_to_slot_purpose(idea, brand):
            n += 1
    return n


def bind_selected_gallery_to_analysis(idea: dict[str, Any], gallery_analysis: Any) -> str:
    """Stamp gallery_analysis_key when selected_gallery_url matches an analysis row."""
    if not isinstance(idea, dict):
        return ""
    ga = gallery_analysis
    if isinstance(ga, str):
        try:
            ga = json.loads(ga) if ga.strip() else {}
        except json.JSONDecodeError:
            ga = {}
    if not isinstance(ga, dict) or not ga:
        return ""

    spec = idea.get("visual_production_spec")
    url = ""
    if isinstance(spec, dict):
        url = str(spec.get("selected_gallery_url") or "").strip()
    if not url:
        url = str(idea.get("selected_gallery_url") or "").strip()
    if not url:
        return ""

    def _base(u: str) -> str:
        raw = u.split("?", 1)[0].rstrip("/").lower()
        if "key=" in u.lower():
            from urllib.parse import parse_qs, urlparse, unquote
            q = parse_qs(urlparse(u).query)
            keys = q.get("key") or []
            if keys:
                return unquote(keys[0]).lower()
        return raw

    def _file(u: str) -> str:
        return _base(u).rsplit("/", 1)[-1]

    target = _base(url)
    target_file = _file(url)
    hit = ""
    for key in ga:
        b = _base(str(key))
        if b == target or _file(str(key)) == target_file:
            hit = str(key)
            break
    if not hit:
        return ""
    idea["gallery_analysis_key"] = hit
    if isinstance(spec, dict):
        spec["gallery_analysis_key"] = hit
    return hit
