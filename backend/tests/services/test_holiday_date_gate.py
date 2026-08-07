"""Hard date gate — past Ramazan/Kurban must not drive August content."""

from datetime import date

from app.services.holiday_date_gate import (
    filter_urgent_ideas_for_date,
    religious_holiday_is_in_content_window,
    sanitize_market_copy_for_date,
    text_references_past_religious_holiday,
    verified_upcoming_holidays_prompt_block,
)


def test_ramazan_2026_not_in_window_in_august():
    today = date(2026, 8, 6)
    assert religious_holiday_is_in_content_window("ramazan_bayram", today) is False
    assert text_references_past_religious_holiday(
        "Ramazan Bayramı'na yaklaşılırken çocuk partisi",
        today,
    )


def test_ramazan_in_window_mid_march():
    today = date(2026, 3, 18)
    assert religious_holiday_is_in_content_window("ramazan_bayram", today) is True
    assert not text_references_past_religious_holiday(
        "Ramazan Bayramı çocuk partisi konsepti",
        today,
    )


def test_filter_urgent_ideas_drops_past_bayram():
    today = date(2026, 8, 6)
    ideas = [
        {
            "title": "Renkli Ramazan Bayramı Çocuk Partisi Konsepti",
            "why_now": "Ramazan Bayramı yakın",
            "urgency": "this_week",
        },
        {
            "title": "Hafta sonu rezervasyon hatırlatma",
            "why_now": "Cumartesi yaklaşıyor",
            "urgency": "today",
        },
    ]
    kept = filter_urgent_ideas_for_date(ideas, today)
    assert len(kept) == 1
    assert "rezervasyon" in kept[0]["title"].lower()


def test_sanitize_trend_brief_strips_past_bayram_lines():
    today = date(2026, 8, 6)
    brief = """## Trendler
- Ağustos çocuk partisi ilgi yüksek
- Ramazan Bayramı'na yaklaşılırken bayram konseptleri trend
- Hijyen ve güvenlik önemli
"""
    out = sanitize_market_copy_for_date(brief, today)
    assert "Ramazan" not in out
    assert "Ağustos" in out
    assert "Hijyen" in out


def test_national_cocuk_bayram_not_blocked_in_april():
    today = date(2026, 4, 20)
    assert not text_references_past_religious_holiday(
        "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı etkinliği",
        today,
    )


def test_verified_upcoming_block_mentions_today():
    block = verified_upcoming_holidays_prompt_block(date(2026, 8, 6))
    assert "2026-08-06" in block
    assert "none" in block.lower() or "VERIFIED" in block
