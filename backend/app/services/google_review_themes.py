"""
Extract thematic clusters from Google review signals for strategist / DNA.

Does not invent ratings — only clusters existing `{text, stars}` snippets.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any


_THEME_MAP: list[tuple[str, list[str]]] = [
    ("lezzet / ürün kalitesi", ["lezzet", "tat", "delicious", "yemek", "ürün", "kalite", "fresh", "taze", "bal", "zeytin"]),
    ("hizmet / personel", ["personel", "ilgi", "servis", "service", "staff", "güler", "ilgili", "kibar"]),
    ("ortam / atmosfer", ["ortam", "atmosfer", "manzara", "view", "ambiance", "dekor", "temiz", "clean"]),
    ("fiyat / değer", ["fiyat", "pahalı", "ucuz", "değer", "price", "expensive", "worth", "ücret"]),
    ("konum / ulaşım", ["konum", "yer", "parking", "otopark", "ulaşım", "location", "merkez"]),
    ("rezervasyon / bekleme", ["rezervasyon", "bekleme", "queue", "wait", "sıra", "booking"]),
    ("hijyen", ["hijyen", "kirli", "temizlik", "dirty", "hygiene"]),
]


def parse_google_review_signals(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except Exception:
            return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("comment") or "").strip()
        if not text:
            continue
        stars = item.get("stars")
        if stars is None:
            stars = item.get("rating")
        try:
            stars_f = float(stars) if stars is not None else None
        except (TypeError, ValueError):
            stars_f = None
        out.append({"text": text[:400], "stars": stars_f})
    return out


def extract_google_review_themes(signals: list[dict[str, Any]] | Any) -> dict[str, Any]:
    rows = signals if isinstance(signals, list) and signals and isinstance(signals[0], dict) else parse_google_review_signals(signals)
    if not rows:
        return {"themes": [], "praise": [], "complaints": [], "review_count": 0}

    theme_hits: Counter[str] = Counter()
    praise: list[str] = []
    complaints: list[str] = []
    for row in rows:
        text = str(row.get("text") or "")
        blob = text.lower()
        stars = row.get("stars")
        for label, kws in _THEME_MAP:
            if any(kw in blob for kw in kws):
                theme_hits[label] += 1
        snippet = re.sub(r"\s+", " ", text).strip()[:140]
        if not snippet:
            continue
        try:
            s = float(stars) if stars is not None else None
        except (TypeError, ValueError):
            s = None
        if s is not None and s <= 2.5:
            complaints.append(snippet)
        elif s is not None and s >= 4.0:
            praise.append(snippet)

    themes = [t for t, _ in theme_hits.most_common(6)]
    return {
        "themes": themes,
        "praise": praise[:4],
        "complaints": complaints[:4],
        "review_count": len(rows),
    }


def format_review_themes_for_learning(themes: dict[str, Any], *, rating: str | None = None) -> str:
    if not themes or not themes.get("review_count"):
        return ""
    lines = ["### GOOGLE YORUM TEMALARI (sosyal kanıt / recovery açıları):"]
    if rating:
        lines.append(f"- Rating: {rating} · n={themes.get('review_count')}")
    if themes.get("themes"):
        lines.append(f"- Öne çıkan temalar: {', '.join(themes['themes'])}")
    for p in themes.get("praise") or []:
        lines.append(f"- [+] \"{p}\"")
    for c in themes.get("complaints") or []:
        lines.append(f"- [-] \"{c}\"")
    lines.append(
        "Mission ipucu: övgü temalarını SOSYAL_KANIT / ÜRÜN_HIGHLIGHT için kullan; "
        "şikayet temalarını recovery veya operasyonel iyileştirme açısına çevir — abartma."
    )
    return "\n".join(lines)
