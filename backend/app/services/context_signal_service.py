"""
Python-side context signal generator.

Mirrors the TypeScript Context Signal Engine used by the frontend when the
scheduler runs proposals autonomously (no browser session available).

Covers:
  - Turkish public holidays (deterministic, no API needed)
  - Current season (date + hemisphere-aware)
  - Weekday rhythm signals
  - Industry calendar phase (from persisted brand context)
"""

from __future__ import annotations

from datetime import datetime, timezone, date
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.crew.context import BrandInfo


# ── Turkish public holidays (fixed dates only) ───────────────────────────────
# Format: (month, day) → name
_TR_FIXED_HOLIDAYS: dict[tuple[int, int], str] = {
    (1, 1): "Yılbaşı",
    (4, 23): "Ulusal Egemenlik ve Çocuk Bayramı",
    (5, 1): "Emek ve Dayanışma Günü",
    (5, 19): "Atatürk'ü Anma / Gençlik ve Spor Bayramı",
    (7, 15): "Demokrasi ve Millî Birlik Günü",
    (8, 30): "Zafer Bayramı",
    (10, 29): "Cumhuriyet Bayramı",
}

# Religious holidays shift annually — approximate fixed ranges for major years
# These are good-enough for content planning (±1 day is fine)
_TR_RELIGIOUS_2025: list[tuple[date, str]] = [
    (date(2025, 3, 30), "Ramazan Bayramı Arifesi"),
    (date(2025, 3, 31), "Ramazan Bayramı 1. Günü"),
    (date(2025, 4, 1), "Ramazan Bayramı 2. Günü"),
    (date(2025, 4, 2), "Ramazan Bayramı 3. Günü"),
    (date(2025, 6, 6), "Kurban Bayramı Arifesi"),
    (date(2025, 6, 7), "Kurban Bayramı 1. Günü"),
    (date(2025, 6, 8), "Kurban Bayramı 2. Günü"),
    (date(2025, 6, 9), "Kurban Bayramı 3. Günü"),
    (date(2025, 6, 10), "Kurban Bayramı 4. Günü"),
    (date(2025, 2, 28), "Ramazan Başlangıcı"),
]

_TR_RELIGIOUS_2026: list[tuple[date, str]] = [
    (date(2026, 3, 20), "Ramazan Bayramı Arifesi"),
    (date(2026, 3, 21), "Ramazan Bayramı 1. Günü"),
    (date(2026, 3, 22), "Ramazan Bayramı 2. Günü"),
    (date(2026, 3, 23), "Ramazan Bayramı 3. Günü"),
    (date(2026, 5, 26), "Kurban Bayramı Arifesi"),
    (date(2026, 5, 27), "Kurban Bayramı 1. Günü"),
    (date(2026, 5, 28), "Kurban Bayramı 2. Günü"),
    (date(2026, 5, 29), "Kurban Bayramı 3. Günü"),
    (date(2026, 5, 30), "Kurban Bayramı 4. Günü"),
    (date(2026, 2, 17), "Ramazan Başlangıcı"),
]


def _get_upcoming_holidays(today: date, horizon_days: int = 21) -> list[str]:
    """Return Turkish holidays within the next `horizon_days` days."""
    hits: list[tuple[int, str]] = []

    # Fixed holidays
    for (m, d), name in _TR_FIXED_HOLIDAYS.items():
        candidate = date(today.year, m, d)
        delta = (candidate - today).days
        if 0 <= delta <= horizon_days:
            hits.append((delta, name))
        # Also check year+1 wrap-around
        candidate_next = date(today.year + 1, m, d)
        delta_next = (candidate_next - today).days
        if 0 <= delta_next <= horizon_days:
            hits.append((delta_next, name))

    # Religious holidays
    religious = _TR_RELIGIOUS_2025 + _TR_RELIGIOUS_2026
    for d_obj, name in religious:
        delta = (d_obj - today).days
        if 0 <= delta <= horizon_days:
            hits.append((delta, name))

    hits.sort(key=lambda x: x[0])
    return [f"{name} ({delta} gün sonra)" for delta, name in hits]


def _get_current_season(today: date, location: str = "") -> str:
    """Return the current season as a Turkish string."""
    m = today.month
    if m in (12, 1, 2):
        season = "Kış"
    elif m in (3, 4, 5):
        season = "İlkbahar"
    elif m in (6, 7, 8):
        season = "Yaz"
    else:
        season = "Sonbahar"
    return season


def _get_weekday_signal(today: date, business_type: str = "") -> str:
    """Return a weekday rhythm hint relevant to the business type."""
    day_names = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    day_name = day_names[today.weekday()]
    day_no = today.weekday()  # 0=Mon … 6=Sun

    btype = (business_type or "").lower()

    if day_no == 0:
        return f"Bugün {day_name} — Hafta başlangıcı: motivasyonel ve hedef odaklı içerikler iyi performans gösterir."
    if day_no == 4:
        fomo = "restoran" in btype or "beach" in btype or "nightlife" in btype or "bar" in btype
        return (
            f"Bugün {day_name} — Haftasonu öncesi: rezervasyon ve etkinlik hatırlatma içerikleri yüksek dönüşüm sağlar."
            if fomo else
            f"Bugün {day_name} — Hafta sonu öncesi: hafif, eğlenceli içerikler dikkat çeker."
        )
    if day_no in (5, 6):
        return f"Bugün {day_name} — Haftasonu: görsel ağırlıklı, deneyim odaklı içerikler öne çıkar."
    return f"Bugün {day_name} — Haftanın ortası: eğitici ve değer sunan içerikler etkileşim alır."


def build_python_context_signals(brand: "BrandInfo") -> str:
    """
    Build a context-signals markdown block for use in scheduler auto-proposals.

    This is the Python counterpart of the TypeScript Context Signal Engine.
    Called from `_semi_auto_proposal_job` when no frontend session is available.
    """
    import json as _json

    now = datetime.now(timezone.utc)
    today = now.date()
    location = getattr(brand, "location", None) or getattr(brand, "city", None) or ""
    btype = brand.business_type or ""

    lines: list[str] = [
        "=== BAĞLAM SİNYALLERİ (Otomatik) ===",
        f"Tarih: {today.isoformat()} | Sezon: {_get_current_season(today, location)}" +
        (f" | Lokasyon: {location}" if location else ""),
    ]

    # Weekday rhythm
    weekday_signal = _get_weekday_signal(today, btype)
    lines.append(f"Haftanın günü: {weekday_signal}")

    # Upcoming holidays
    holidays = _get_upcoming_holidays(today, horizon_days=21)
    if holidays:
        lines.append("Yaklaşan tatiller/bayramlar: " + " | ".join(holidays))
    else:
        lines.append("Yaklaşan 21 günde belirgin tatil/bayram yok.")

    # Industry calendar phase
    industry_cal = getattr(brand, "industry_calendar", None)
    if industry_cal:
        try:
            cal = _json.loads(industry_cal) if isinstance(industry_cal, str) else industry_cal
            phase = cal.get("current_phase") or {}
            phase_name = phase.get("name") or phase.get("phase_name") or ""
            urgency = phase.get("urgency_level") or phase.get("urgency") or ""
            key_msg = phase.get("key_message") or phase.get("content_theme") or ""
            upcoming = cal.get("upcoming_triggers") or []
            if phase_name:
                lines.append(f"Sektör takvimi aktif fazı: {phase_name}" + (f" (Aciliyet: {urgency})" if urgency else ""))
            if key_msg:
                lines.append(f"Kilit mesaj: {key_msg}")
            if upcoming and isinstance(upcoming, list):
                next_triggers = [t.get("name") or str(t) for t in upcoming[:3] if t]
                if next_triggers:
                    lines.append("Yaklaşan sektör tetikleyicileri: " + ", ".join(next_triggers))
        except Exception:
            pass

    lines.append("Bu sinyallere dayanarak misyon önerisini tarih ve sektör dinamiklerine göre özelleştir.")
    return "\n".join(lines)
