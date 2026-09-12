"""Generic onboarding identity guards.

Stops menu-heavy stay venues (pension + restaurant) from becoming
local_products_shop or beach_club, and drops site-builder chrome from galleries.
No tenant names or UUIDs — evidence from crawl text and URLs only.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

_STAY_PHRASES = (
    "pansiyon",
    "pension",
    "guesthouse",
    "guest house",
    "odalarımız",
    "odaları",
    "oda kahvaltı",
    "check-in",
    "check in",
    "boutique hotel",
    "butik otel",
)
_STAY_LOOSE = ("otel", "hotel", "resort", "suite")
_ROOM_COUNT = re.compile(r"\b\d{1,3}\s*(oda|odalı|odalik|room|rooms)\b", re.IGNORECASE)

_NIGHTLIFE_PHRASES = (
    "beach club",
    "beach bar",
    "pool club",
    "pool party",
    "plaj kulüb",
    "plaj kulub",
    "gece kulüb",
    "gece kulub",
    "dj set",
    "dj night",
    "dj sahne",
    "sunset bar",
    "open bar",
)
_RETAIL_SHOP = (
    "sipariş",
    "kargo",
    "e-ticaret",
    "e-commerce",
    "online shop",
    "dükkan",
    "dukkan",
    "mağazamız",
    "magazamiz",
    "şişelenmiş",
    "siselenmis",
    "kavanoz",
    "ambalaj",
    "üretici dükkan",
    "farm shop",
)
_CHROME_HOST_MARKERS = (
    "parastorage.com",
    "editor-elements",
    "restaurant-menus-showcase",
    "sloppyframe",
)
_CHROME_PATH_MARKERS = (
    "11062b_",
    "w_32",
    "w_55",
    "w_90",
    "w_147",
    "blur_2",
    "lg_1",
)
_MENU_PATH = re.compile(r"menu|menü|menü|fiyat", re.IGNORECASE)
_ABOUT_PATH = re.compile(
    r"hakkimizda|hakkımızda|about|konaklama|odal|pansiyon|rooms|stay",
    re.IGNORECASE,
)
_PRICE_LINE = re.compile(r"[₺$€]\s*\d|\d+\s*₺|\d+\s*gr\.?|\bmenü\b|\bmenu\b", re.IGNORECASE)


def _blob(text: str) -> str:
    return (text or "").lower()


def is_stay_venue(text: str) -> bool:
    blob = _blob(text)
    if any(p in blob for p in _STAY_PHRASES):
        return True
    if _ROOM_COUNT.search(blob):
        return True
    lodging = any(p in blob for p in _STAY_LOOSE)
    rooms = any(w in blob for w in ("oda ", " oda", "room", "kahvaltı", "breakfast"))
    if lodging and rooms:
        return True
    # "konaklama" alone is common on restaurant/bungalow pages — need a room signal.
    if "konaklama" in blob and (
        _ROOM_COUNT.search(blob)
        or any(w in blob for w in ("oda", "room", "pansiyon", "otel", "hotel"))
    ):
        return True
    return False


def is_nightlife_venue(text: str) -> bool:
    blob = _blob(text)
    return any(p in blob for p in _NIGHTLIFE_PHRASES)


def is_retail_product_shop(text: str) -> bool:
    blob = _blob(text)
    return any(p in blob for p in _RETAIL_SHOP)


def is_editor_chrome_image_url(url: str) -> bool:
    """Wix/Parastorage editor chrome, stock menu plates, tiny thumbs — not venue photos."""
    raw = (url or "").strip()
    if not raw.startswith("http"):
        return False
    low = raw.lower()
    if any(m in low for m in _CHROME_HOST_MARKERS):
        return True
    if any(m in low for m in _CHROME_PATH_MARKERS):
        return True
    host = urlparse(raw).netloc.lower()
    if "wixstatic.com" in host and ("/v1/fill/w_32" in low or "/v1/fill/w_55" in low):
        return True
    return False


def score_crawled_page(url: str, text: str) -> int:
    """About / stay pages outrank price-list menus and shop-keyword stuffing."""
    if not (text or "").strip():
        return 0
    low_url = (url or "").lower()
    low = text.lower()
    score = max(len(text) // 250, 1)
    if _ABOUT_PATH.search(low_url):
        score += 22
    if any(w in low_url for w in ("iletisim", "iletişim", "contact")):
        score += 6
    price_hits = text.count("₺") + text.count("$") + text.count("€")
    if _MENU_PATH.search(low_url) or price_hits >= 8:
        score -= 14
        score += min(price_hits, 2)
    if is_stay_venue(text):
        score += 12
    if is_nightlife_venue(text):
        score += 4
    # Do not boost zeytinyağı/reçel here — that is what flipped stay venues to shops.
    return max(score, 1)


def _cap_menu_excerpt(text: str, limit: int) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    kept: list[str] = []
    for ln in lines:
        if _PRICE_LINE.search(ln) or len(ln) < 80:
            kept.append(ln)
        if len("\n".join(kept)) >= limit:
            break
    return "\n".join(kept)[:limit]


def identity_first_from_pages(pages: list[dict[str, Any]], max_chars: int = 8000) -> str:
    about: list[str] = []
    other: list[str] = []
    menu: list[str] = []
    for page in pages:
        url = str(page.get("url") or "")
        text = str(page.get("text") or "").strip()
        if not text:
            continue
        low_url = url.lower()
        if _MENU_PATH.search(low_url) or text.count("₺") >= 8:
            menu.append(text[:1600])
        elif _ABOUT_PATH.search(low_url) or is_stay_venue(text):
            about.append(text[:2800])
        else:
            other.append(text[:1800])
    identity = "\n\n---\n\n".join(about + other[:2])[:6200]
    menu_bit = ""
    if menu:
        menu_bit = "\n\nMenü özeti:\n" + _cap_menu_excerpt(menu[0], 900)
    return (identity + menu_bit).strip()[:max_chars]


def identity_first_summary(description: str, snippet: str, max_chars: int = 4000) -> str:
    """Keep About/stay prose first; treat price lines as a short menu appendix."""
    identity_lines: list[str] = []
    menu_lines: list[str] = []
    for block in (description, snippet):
        for ln in str(block or "").splitlines():
            line = ln.strip()
            if not line:
                continue
            if _PRICE_LINE.search(line) and len(line) < 160:
                menu_lines.append(line)
            else:
                identity_lines.append(line)
    parts = ["\n".join(identity_lines).strip()]
    if menu_lines:
        parts.append("Menü özeti:\n" + "\n".join(menu_lines[:18]))
    return "\n\n".join(p for p in parts if p)[:max_chars]


def stay_content_pillars(text: str) -> list[str]:
    blob = _blob(text)
    pillars = ["venue_atmosphere", "stay_welcome", "daily_story", "social_proof"]
    if any(w in blob for w in ("menü", "menu", "kahvaltı", "breakfast", "yemek", "sofra")):
        pillars.append("menu_highlight")
    pillars.append("seasonal_content")
    pillars.append("behind_the_scenes")
    if is_nightlife_venue(text):
        pillars.insert(4, "event_announcement")
    return list(dict.fromkeys(pillars))[:7]


def stay_target_audience(text: str) -> list[str]:
    blob = _blob(text)
    if any(w in blob for w in ("çocuk", "cocuk", "aile", "family", "kids")):
        return [
            "çocuklu aileler",
            "sakin koy / sahil tatili arayanlar",
            "rezervasyon odaklı misafirler",
        ]
    return [
        "sakin konaklama arayanlar",
        "kısa tatil ve kahvaltı misafirleri",
        "rezervasyon odaklı misafirler",
    ]


def nightlife_target_audience() -> list[str]:
    return ["tatilciler", "etkinlik ve müzik takipçileri", "rezervasyon odaklı misafirler"]


def shop_target_audience() -> list[str]:
    return ["yerel lezzet arayanlar", "hediye ve sofra ürünü alanlar", "online / dükkân müşterileri"]


def infer_audience_for_industry(text: str, industry: str) -> list[str]:
    ind = (industry or "").lower()
    if ind in {"beach_club", "hospitality_entertainment", "nightclub_lounge"} or is_nightlife_venue(text):
        if is_stay_venue(text) and not is_nightlife_venue(text):
            return stay_target_audience(text)
        return nightlife_target_audience()
    if ind in {"hospitality", "hotel", "hotel_resort", "boutique_hotel"} or (
        is_stay_venue(text) and not is_nightlife_venue(text)
    ):
        return stay_target_audience(text)
    if ind in {"local_products_shop", "ecommerce_retail", "handmade_product_brand"}:
        return shop_target_audience()
    if ind in {"restaurant", "restaurant_cafe", "cafe_bakery", "coffee_shop"}:
        return ["yerel ve seyahat halindeki misafirler", "sofra / kahvaltı arayanlar", "rezervasyon odaklı misafirler"]
    return ["mevcut müşteriler", "potansiyel müşteriler", "yerel takipçiler"]


def facility_defaults_for_sector(sector: str, text: str = "") -> dict[str, bool]:
    """Nightlife amenities stay on for clubs; stay/shop venues start conservative."""
    # Mirror slot_catalog_service._DEFAULT_SLOT_FACILITIES — do not import (cycle).
    base = {
        "pool": True,
        "dj_stage": True,
        "full_menu": True,
        "spa": True,
        "outdoor_terrace": True,
        "private_events": True,
        "live_music": True,
        "classes": True,
        "kids_area": True,
        "delivery": True,
        "hiring": False,
        "events_calendar": False,
        "wedding_photography": False,
        "bar": False,
    }
    sec = (sector or "").lower()
    blob = f"{text} {sector}"
    if sec in {"beach_club", "nightclub", "nightclub_lounge"} or is_nightlife_venue(blob):
        return base
    if sec in {"local_products_shop", "ecommerce_retail", "fashion_boutique", "handmade_product_brand"}:
        base.update({
            "dj_stage": False,
            "live_music": False,
            "spa": False,
            "pool": False,
            "classes": False,
            "private_events": False,
            "kids_area": False,
            "full_menu": False,
            "delivery": True,
            "outdoor_terrace": False,
        })
        return base
    # Hospitality / restaurant / default stay
    if sec in {"hospitality", "restaurant_cafe", "coffee_shop", "cafe_bakery", "bakery_patisserie"} or is_stay_venue(blob):
        evidenced_menu = any(w in _blob(blob) for w in ("menü", "menu", "kahvaltı", "restoran"))
        evidenced_kids = any(w in _blob(blob) for w in ("çocuk", "cocuk", "aile", "kids", "family"))
        evidenced_terrace = any(w in _blob(blob) for w in ("teras", "bahçe", "bahce", "sahil", "koy", "plaj", "deniz"))
        base.update({
            "dj_stage": False,
            "live_music": False,
            "spa": False,
            "pool": False,
            "classes": False,
            "delivery": False,
            "private_events": False,
            "full_menu": evidenced_menu or sec in {"restaurant_cafe", "hospitality"},
            "kids_area": evidenced_kids,
            "outdoor_terrace": evidenced_terrace or is_stay_venue(blob),
        })
        return base
    return base
