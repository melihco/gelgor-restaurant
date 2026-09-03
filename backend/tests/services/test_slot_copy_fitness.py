"""
Two ways a slot brief can poison the copy it was meant to steer.

The ideation prompt has to name each deliverable in production language for the
idea to be written for the right slot ("Tipografi poster story", "Çiftlikten
sofraya story"). On a live Gel Gör mission the model answered in that language:
the idea for the typography slot carried the headline "Tipografi ile Huzur!".

The same mission shipped "Zafer Bayramı'nda buluşalım!" to a live frame on
3 September — four days after the 30 August holiday. The existing date gate
covers only Ramazan and Kurban, and explicitly exempts the national days, so
nothing was watching them.

Both rules are checked on two sectors, because a slot brief is a package
mechanism rather than a restaurant one.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.content_consistency_service import (
    check_weekly_content,
    find_production_craft_words,
)
from app.services.holiday_date_gate import find_out_of_window_holidays


class TestCraftWords:
    def test_catches_the_headline_that_shipped(self):
        assert find_production_craft_words("Tipografi ile Huzur!") == ["tipografi"]

    def test_catches_the_stem_under_a_turkish_suffix(self):
        """Anchoring on a closing boundary would miss every inflected form."""
        assert find_production_craft_words("Tipografimiz hazır") == ["tipografi"]
        assert find_production_craft_words("Posterimizi beğendiniz mi?") == ["poster"]

    def test_reports_the_stem_not_the_inflected_form(self):
        assert find_production_craft_words("Şablonumuzu yeniledik") == ["şablon"]

    @pytest.mark.parametrize(
        "line",
        [
            "Serpme köy kahvaltısı için yerinizi ayırtın!",
            "Mutfak kulisimize hoş geldiniz",
            "Çiftlikten sofraya, her gün taze",
            "Masa hazır, sizi bekliyoruz",
        ],
    )
    def test_leaves_publishable_headlines_alone(self, line):
        assert find_production_craft_words(line) == []

    @pytest.mark.parametrize("line", ["Story'mize göz atın", "Yeni reel yayında"])
    def test_does_not_police_words_brands_say_to_customers(self, line):
        """`story` and `reel` are excluded on purpose — brands do use them."""
        assert find_production_craft_words(line) == []

    def test_afis_is_legitimate_turkish_for_a_real_poster(self):
        assert find_production_craft_words("Etkinlik afişimiz yayında") == []

    def test_empty_text_is_not_an_error(self):
        assert find_production_craft_words("") == []
        assert find_production_craft_words("   ") == []


class TestHolidayWindow:
    SEP_3 = date(2026, 9, 3)

    def test_catches_the_holiday_that_shipped(self):
        """30 August named on 3 September — the frame that reached the feed."""
        assert find_out_of_window_holidays(
            "Zafer Bayramı'nda buluşalım!", self.SEP_3
        ) == ["Zafer Bayramı"]

    def test_allows_the_same_holiday_inside_its_run_up(self):
        assert find_out_of_window_holidays(
            "Zafer Bayramı'nda buluşalım!", date(2026, 8, 25)
        ) == []

    def test_allows_the_day_itself(self):
        assert find_out_of_window_holidays(
            "30 Ağustos'ta bahçemizdeyiz", date(2026, 8, 30)
        ) == []

    def test_catches_a_holiday_still_months_away(self):
        assert find_out_of_window_holidays(
            "Cumhuriyet Bayramı menümüz", self.SEP_3
        ) == ["Cumhuriyet Bayramı"]

    def test_catches_a_religious_bayram_out_of_window(self):
        assert find_out_of_window_holidays(
            "Ramazan Bayramı sofrası", self.SEP_3
        ) == ["Ramazan Bayramı"]

    def test_allows_a_religious_bayram_inside_its_window(self):
        assert find_out_of_window_holidays(
            "Ramazan Bayramı sofrası", date(2026, 3, 18)
        ) == []

    def test_new_year_in_late_december_is_in_window(self):
        """The occurrence search must span years or December reads as stale."""
        assert find_out_of_window_holidays("Yılbaşı menümüz", date(2026, 12, 28)) == []

    def test_new_year_in_early_january_is_still_in_grace(self):
        assert find_out_of_window_holidays("Yılbaşı menümüz", date(2027, 1, 1)) == []

    def test_ordinary_copy_names_no_holiday(self):
        assert find_out_of_window_holidays("Bahçemizde kahvaltı keyfi", self.SEP_3) == []

    def test_empty_text_is_not_an_error(self):
        assert find_out_of_window_holidays("", self.SEP_3) == []


def _concepts(headlines: list[str]) -> list[dict]:
    return [
        {
            "headline": h,
            "content_type": "post" if i % 2 else "story",
            "caption_draft": "Bugün sofrada taze ürünler var, sizi bekliyoruz.",
            "cta": f"Rezervasyon {i}",
            "template_use_case": f"use_case_{i}",
        }
        for i, h in enumerate(headlines)
    ]


@pytest.fixture
def on_september_third(monkeypatch):
    frozen = type("D", (date,), {"today": staticmethod(lambda: date(2026, 9, 3))})
    monkeypatch.setattr("app.services.holiday_date_gate.date", frozen)
    monkeypatch.setattr("app.services.context_signal_service.date", frozen)


class TestBatchCheck:
    def test_restaurant_batch_reports_the_craft_word(self, on_september_third):
        report = check_weekly_content(
            _concepts([
                "Tipografi ile Huzur!",
                "Mutfak kulisimize hoş geldiniz",
                "Masa hazır, sizi bekliyoruz",
            ]),
            content_pillars=[],
            brand_ctas=[],
        )

        issue = next(i for i in report.issues if i.check == "craft_word_leak")
        assert issue.severity == "error"
        assert "Tipografi ile Huzur" in issue.description
        assert report.passed is False

    def test_local_products_batch_reports_the_stale_holiday(self, on_september_third):
        report = check_weekly_content(
            _concepts([
                "Zafer Bayramı'nda buluşalım!",
                "Erken hasat zeytinyağı geldi",
                "Badem ezmemiz tazelendi",
            ]),
            content_pillars=[],
            brand_ctas=[],
        )

        issue = next(i for i in report.issues if i.check == "holiday_out_of_window")
        assert issue.severity == "error"
        assert "Zafer Bayramı" in issue.description
        assert report.passed is False

    def test_a_clean_local_products_batch_passes_both_checks(self, on_september_third):
        report = check_weekly_content(
            _concepts([
                "Erken hasat zeytinyağı geldi",
                "Badem ezmemiz tazelendi",
                "Sonbahar hasadına hazırlık",
            ]),
            content_pillars=[],
            brand_ctas=[],
        )

        assert [i for i in report.issues if i.check == "craft_word_leak"] == []
        assert [i for i in report.issues if i.check == "holiday_out_of_window"] == []

    def test_a_clean_restaurant_batch_passes_both_checks(self, on_september_third):
        report = check_weekly_content(
            _concepts([
                "Serpme köy kahvaltısı için yerinizi ayırtın!",
                "Çiftlikten sofraya, her gün taze",
                "Mutfak kulisimize hoş geldiniz",
            ]),
            content_pillars=[],
            brand_ctas=[],
        )

        assert [i for i in report.issues if i.check == "craft_word_leak"] == []
        assert [i for i in report.issues if i.check == "holiday_out_of_window"] == []
