"""Unit tests for strategist post-LLM diversity gate + retry hint."""

from app.crew.context import BrandInfo
from app.crew.crews.strategist_crew import (
    _build_diversity_retry_hint,
    _check_proposal_diversity,
    _extract_recent_mission_titles,
    _title_jaccard,
)


def _brand(**kwargs) -> BrandInfo:
    defaults = dict(
        business_name="Test Shop",
        business_type="local_products_shop",
        learning_context="",
    )
    defaults.update(kwargs)
    return BrandInfo(**defaults)  # type: ignore[arg-type]


def test_title_jaccard_exact_repeat() -> None:
    a = "bal ve badem hediyelik setleri tanıtımı"
    b = "Bal ve Badem Hediyelik Setleri Tanıtımı"
    assert _title_jaccard(a, b.lower()) > 0.45


def test_extract_recent_titles_prefers_son_misyonlar_block() -> None:
    lc = """
Some learning bullet:
- random learning tip about captions

### SON MİSYONLAR — rejected/cancelled DAHİL (BUNLARI TEKRAR ÖNERME):
- [COMPLETED] Bal ve Badem Hediyelik Setleri Tanıtımı (tür: opportunity, sinyal: x)
- [COMPLETED] Erken Hasat Zeytinyağı Hikaye Paylaşımı (tür: seasonal, sinyal: y)

### YANMIŞ TEMALAR (bu turda YASAK): Erken hasat

=== SEKTÖRE ÖZEL MİSYON AÇILARI ===
• SEZONSAL → "Yaz Menüsü Lansmanı", "Ramazan Özel Menüsü"
"""
    titles = _extract_recent_mission_titles(lc)
    assert "bal ve badem hediyelik setleri tanıtımı" in titles
    assert "erken hasat zeytinyağı hikaye paylaşımı" in titles
    assert not any("yaz menüsü" in t for t in titles)
    assert not any("random learning" in t for t in titles)


def test_diversity_rejects_recent_repeat_for_local_shop() -> None:
    lc = """
### SON MİSYONLAR — rejected/cancelled DAHİL (BUNLARI TEKRAR ÖNERME):
- [COMPLETED] Bal ve Badem Hediyelik Setleri Tanıtımı (tür: opportunity, sinyal: x)
"""
    brand = _brand(learning_context=lc)
    report = _check_proposal_diversity(
        [{"title": "Bal ve Badem Hediyelik Setleri Tanıtımı", "trigger_signal": "a"}],
        brand,
    )
    assert report["filtered_proposals"] == []
    assert report["duplicates_removed"] == 1
    assert any("Repeats recent mission" in r for r in report["reasons"])


def test_retry_hint_lists_burned_titles_and_local_product_angles() -> None:
    brand = _brand(business_type="local_products_shop")
    hint = _build_diversity_retry_hint(
        brand,
        reasons=["Repeats recent mission: 'Bal ve Badem' ≈ 'bal ve badem'"],
        recent_titles=["bal ve badem hediyelik setleri tanıtımı", "erken hasat zeytinyağı"],
    )
    assert "BURNED / RECENT TITLES" in hint
    assert "bal ve badem hediyelik setleri tanıtımı" in hint
    assert "Local products OK angles" in hint
    assert "sunset dining" not in hint


def test_retry_hint_hospitality_keeps_wellness_ban() -> None:
    brand = _brand(business_type="beach_club", business_name="Pilot Beach")
    hint = _build_diversity_retry_hint(
        brand,
        reasons=["Hospitality brand blocked wellness/skin campaign: 'Cilt'"],
        recent_titles=["cilt bakımı paketi"],
    )
    assert "Hospitality OK angles" in hint
    assert "NEVER spa" in hint
