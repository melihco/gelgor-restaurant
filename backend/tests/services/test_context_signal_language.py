"""Context signals must follow brand.languages (EN brands must not get TR hooks)."""

from datetime import date
from types import SimpleNamespace

from app.services.context_signal_service import (
    _get_current_season,
    _resolve_signal_language,
    _sector_pack_signals,
    build_python_context_signals,
)


def _brand(**kwargs):
    defaults = {
        "business_type": "beach_club",
        "description": "beach club hospitality",
        "location": "Bodrum",
        "city": "Bodrum",
        "languages": "en",
        "industry_calendar": None,
        "_recent_mission_titles": [],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_resolve_signal_language_en():
    assert _resolve_signal_language(_brand(languages="en")) == "en"
    assert _resolve_signal_language(_brand(languages="en-US")) == "en"
    assert _resolve_signal_language(_brand(languages="tr")) == "tr"


def test_season_label_localized():
    summer = date(2026, 7, 15)
    assert _get_current_season(summer, language="tr") == "Yaz"
    assert _get_current_season(summer, language="en") == "Summer"


def test_beach_hospitality_en_hooks_no_turkish_summer_leak():
    today = date(2026, 7, 15)
    hints = _sector_pack_signals("beach_hospitality", today, "beach_club", language="en")
    blob = " ".join(hints)
    assert "Summer peak" in blob or "beach/pool" in blob.lower()
    assert "Yaz zirvesi" not in blob
    assert "serinletici" not in blob


def test_local_artisan_tr_hooks_remain_turkish():
    today = date(2026, 7, 15)
    hints = _sector_pack_signals("local_artisan", today, "local_products_shop", language="tr")
    blob = " ".join(hints)
    assert "Sezon ürünleri" in blob


def test_build_python_context_signals_en_header():
    block = build_python_context_signals(_brand(languages="en"))
    assert "CONTEXT SIGNALS" in block
    assert "MUST be written in English" in block
    assert "BAĞLAM SİNYALLERİ" not in block
    assert "Yaz zirvesi" not in block
    assert "Yaz sezonu" not in block


def test_build_python_context_signals_tr_header():
    block = build_python_context_signals(
        _brand(languages="tr", business_type="local_products_shop", description="yöresel ürünler"),
    )
    assert "BAĞLAM SİNYALLERİ" in block
