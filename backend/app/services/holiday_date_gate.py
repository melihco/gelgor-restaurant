"""
Hard date gate for Turkish holidays in market intel / mission copy.

LLMs often invent "Ramazan Bayramı bu hafta" months after the real date.
Context-signal tables are the SSOT — soft prompt rules alone are not enough.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

# First day of each observance (content window ≈ arife + bayram days).
# Keep in sync with apps/web/src/lib/context-signals/holidays-tr.ts
# and context_signal_service._TR_RELIGIOUS_*.
_RELIGIOUS_WINDOWS: list[tuple[str, date, date]] = [
    # name_key, window_start (inclusive), window_end (inclusive)
    ("ramazan_bayram", date(2025, 3, 30), date(2025, 4, 2)),
    ("kurban_bayram", date(2025, 6, 6), date(2025, 6, 10)),
    ("ramazan_bayram", date(2026, 3, 20), date(2026, 3, 23)),
    ("kurban_bayram", date(2026, 5, 26), date(2026, 5, 30)),
    ("ramazan_bayram", date(2027, 3, 9), date(2027, 3, 12)),
    ("kurban_bayram", date(2027, 5, 15), date(2027, 5, 19)),
]

_NAME_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("ramazan_bayram", re.compile(r"ramazan\s*bayram|eid\s*al[-\s]?fitr", re.I)),
    ("kurban_bayram", re.compile(r"kurban\s*bayram|eid\s*al[-\s]?adha", re.I)),
]

# Bare "bayram" is ambiguous (23 Nisan / Cumhuriyet). Only treat as religious
# when paired with ramazan/kurban OR clearly religious celebration copy.
_BARE_BAYRAM = re.compile(
    r"(?<!23\s)(?<!29\s)(?<!30\s)\bbayram\b|"
    r"bayramla[sş]ma|bayram\s*kutlam|mutlu\s*bayram",
    re.I,
)


def religious_holiday_is_in_content_window(
    key: str,
    today: date | None = None,
    *,
    lead_days: int = 14,
    grace_days: int = 2,
) -> bool:
    today = today or date.today()
    for name, start, end in _RELIGIOUS_WINDOWS:
        if name != key:
            continue
        if (start - timedelta(days=lead_days)) <= today <= (end + timedelta(days=grace_days)):
            return True
    return False


def text_references_past_religious_holiday(text: str, today: date | None = None) -> bool:
    """True when copy pushes a religious bayram that is outside its content window."""
    if not text or not text.strip():
        return False
    today = today or date.today()
    blob = text.lower()

    for key, pattern in _NAME_PATTERNS:
        if not pattern.search(blob):
            continue
        if not religious_holiday_is_in_content_window(key, today):
            return True

    # Ambiguous bare "bayram" — block only when no religious window is active
    # and the line is not clearly a national holiday (23 Nisan / Cumhuriyet / …).
    if _BARE_BAYRAM.search(blob) and not any(p.search(blob) for _, p in _NAME_PATTERNS):
        if religious_holiday_is_in_content_window("ramazan_bayram", today):
            return False
        if religious_holiday_is_in_content_window("kurban_bayram", today):
            return False
        if re.search(
            r"23\s*nisan|cumhuriyet|zafer\s*bayram|ulusal\s*egemenlik|çocuk\s*bayram",
            blob,
        ):
            return False
        return True
    return False


# National holidays sit on fixed dates, so "is this week's copy allowed to name
# it" is answerable without a model. The religious gate above deliberately
# exempts these names, which left them ungated entirely: a live Gel Gör frame
# shipped "Zafer Bayramı'nda buluşalım!" on 3 September, four days after the
# 30 August holiday had passed.
# Keys mirror _TR_FIXED_HOLIDAYS in context_signal_service.
_FIXED_NAME_PATTERNS: list[tuple[tuple[int, int], re.Pattern[str]]] = [
    ((1, 1), re.compile(r"y[ıi]lba[şs][ıi]|yeni\s*y[ıi]l[ıi]?n?\s*(kutlu|ilk)", re.I)),
    ((4, 23), re.compile(r"23\s*nisan|çocuk\s*bayram|ulusal\s*egemenlik", re.I)),
    ((5, 1), re.compile(r"1\s*may[ıi]s|emek\s*ve\s*dayan[ıi][şs]ma", re.I)),
    ((5, 19), re.compile(r"19\s*may[ıi]s|gençlik\s*ve\s*spor", re.I)),
    ((7, 15), re.compile(r"15\s*temmuz|demokrasi\s*ve\s*mill", re.I)),
    ((8, 30), re.compile(r"zafer\s*bayram|30\s*a[ğg]ustos", re.I)),
    ((10, 29), re.compile(r"cumhuriyet\s*bayram|29\s*ekim", re.I)),
]

_FIXED_LABELS: dict[tuple[int, int], str] = {
    (1, 1): "Yılbaşı",
    (4, 23): "23 Nisan",
    (5, 1): "1 Mayıs",
    (5, 19): "19 Mayıs",
    (7, 15): "15 Temmuz",
    (8, 30): "Zafer Bayramı",
    (10, 29): "Cumhuriyet Bayramı",
}


def find_out_of_window_holidays(
    text: str,
    today: date | None = None,
    *,
    lead_days: int = 10,
    grace_days: int = 1,
) -> list[str]:
    """Holiday names the copy invokes while the date is out of reach.

    Covers the fixed national days and the religious bayrams. A holiday is in
    reach from `lead_days` before its first day until `grace_days` after its
    last, which is the span a weekly package can honestly promote.
    """
    if not text or not text.strip():
        return []
    today = today or date.today()
    hits: list[str] = []

    for (month, day), pattern in _FIXED_NAME_PATTERNS:
        if not pattern.search(text):
            continue
        # Compare against this year's and next year's occurrence so a December
        # mention of Yılbaşı is in window rather than eleven months stale.
        in_window = False
        for year in (today.year - 1, today.year, today.year + 1):
            try:
                occurrence = date(year, month, day)
            except ValueError:
                continue
            if (occurrence - timedelta(days=lead_days)) <= today <= (
                occurrence + timedelta(days=grace_days)
            ):
                in_window = True
                break
        if not in_window:
            hits.append(_FIXED_LABELS[(month, day)])

    for key, pattern in _NAME_PATTERNS:
        if not pattern.search(text):
            continue
        if not religious_holiday_is_in_content_window(
            key, today, lead_days=lead_days, grace_days=grace_days,
        ):
            hits.append("Ramazan Bayramı" if key == "ramazan_bayram" else "Kurban Bayramı")

    return hits


def filter_urgent_ideas_for_date(
    ideas: list[Any],
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Drop market_opportunity ideas that reference past religious holidays."""
    today = today or date.today()
    out: list[dict[str, Any]] = []
    for idea in ideas:
        if not isinstance(idea, dict):
            continue
        blob = " ".join(
            str(idea.get(k) or "")
            for k in ("title", "why_now", "format", "urgency", "description")
        )
        if text_references_past_religious_holiday(blob, today):
            continue
        out.append(idea)
    return out


def sanitize_market_copy_for_date(text: str, today: date | None = None) -> str:
    """Remove markdown lines that push a past religious holiday."""
    if not text:
        return text
    today = today or date.today()
    kept: list[str] = []
    for line in text.splitlines():
        if text_references_past_religious_holiday(line, today):
            continue
        kept.append(line)
    # Collapse excess blank lines
    cleaned: list[str] = []
    blank = False
    for line in kept:
        if not line.strip():
            if blank:
                continue
            blank = True
        else:
            blank = False
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def verified_upcoming_holidays_prompt_block(
    today: date | None = None,
    horizon_days: int = 21,
) -> str:
    """Deterministic holiday list for LLM prompts (never invent dates)."""
    from app.services.context_signal_service import _get_upcoming_holidays

    today = today or date.today()
    hits = _get_upcoming_holidays(today, horizon_days=horizon_days)
    if not hits:
        return (
            f"TODAY: {today.isoformat()}\n"
            f"VERIFIED UPCOMING HOLIDAYS (next {horizon_days} days): none.\n"
            "Do NOT mention Ramazan Bayramı, Kurban Bayramı, or other religious "
            "bayrams unless they appear in this verified list. Inventing holiday "
            "dates is forbidden."
        )
    return (
        f"TODAY: {today.isoformat()}\n"
        f"VERIFIED UPCOMING HOLIDAYS (next {horizon_days} days): "
        + " | ".join(hits)
        + "\nOnly use these holiday dates. Do not invent or shift bayram dates."
    )
