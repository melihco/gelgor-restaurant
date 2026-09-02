"""
A weekly content package sits inside one season.

A Gel Gör mission created on 2 September, whose strategist brief said "Yazın son
döneminde", shipped headlines named "Güzel Bahar Sofraları İçin Hazırlıklar" and
"Bu Sonbaharın Tazeliğini Sofranıza Taşıyoruz!". Season was never stated in the
ideation prompt — only implied by the month name — while the originality rule
listed "a different season" as a legitimate variety dimension.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.content_consistency_service import check_weekly_content
from app.services.context_signal_service import (
    find_out_of_season_words,
    resolve_season_window,
)


class TestSeasonWindow:
    def test_early_september_allows_summer_and_autumn(self):
        """The defect date: calendar autumn, but a coastal venue is still in summer."""
        w = resolve_season_window(date(2026, 9, 2))

        assert w["current"] == "autumn"
        assert set(w["allowed"]) == {"summer", "autumn"}
        assert set(w["forbidden"]) == {"spring", "winter"}
        assert w["allowed_labels"] == ["Yaz", "Sonbahar"]

    def test_late_october_is_autumn_only(self):
        w = resolve_season_window(date(2026, 10, 15))

        assert set(w["allowed"]) == {"autumn"}
        assert "summer" in w["forbidden"]

    def test_late_november_opens_the_coming_winter(self):
        w = resolve_season_window(date(2026, 11, 24))

        assert set(w["allowed"]) == {"autumn", "winter"}
        assert "spring" in w["forbidden"]
        # Chronological, so the prompt reads "Sonbahar veya Kış".
        assert w["allowed_labels"] == ["Sonbahar", "Kış"]

    def test_early_march_reads_winter_then_spring(self):
        w = resolve_season_window(date(2026, 3, 5))

        assert w["allowed_labels"] == ["Kış", "İlkbahar"]

    def test_high_summer_forbids_every_other_season(self):
        w = resolve_season_window(date(2026, 7, 14))

        assert set(w["allowed"]) == {"summer"}
        assert set(w["forbidden"]) == {"winter", "spring", "autumn"}

    def test_the_year_boundary_does_not_wrap_wrongly(self):
        """December is winter, and the season before it is autumn — not spring."""
        w = resolve_season_window(date(2026, 12, 3))

        assert set(w["allowed"]) == {"autumn", "winter"}

    @pytest.mark.parametrize("month", range(1, 13))
    def test_every_month_allows_its_own_season(self, month):
        w = resolve_season_window(date(2026, month, 15))

        assert w["current"] in w["allowed"]
        assert w["current"] not in w["forbidden"]
        assert len(w["allowed"]) + len(w["forbidden"]) == 4


class TestOutOfSeasonWords:
    SEP = date(2026, 9, 2)

    def test_catches_the_headline_that_shipped(self):
        assert find_out_of_season_words(
            "Güzel Bahar Sofraları İçin Hazırlıklar", self.SEP
        )

    def test_allows_the_autumn_headline_that_also_shipped(self):
        """Early September may speak of autumn — that one was not the error."""
        assert find_out_of_season_words(
            "Bu Sonbaharın Tazeliğini Sofranıza Taşıyoruz!", self.SEP
        ) == []

    def test_allows_summer_in_early_september(self):
        assert find_out_of_season_words(
            "Yazın Tazeliğini Sofranıza Taşıyoruz!", self.SEP
        ) == []

    def test_sonbahar_is_not_read_as_bahar(self):
        """`sonbahar` contains `bahar`; matching spring naively flags autumn."""
        assert find_out_of_season_words("Sonbahar Menümüz", date(2026, 10, 15)) == []

    def test_ilkbahar_is_caught_in_autumn(self):
        assert find_out_of_season_words("İlkbahar Tazeliği", date(2026, 10, 15))

    def test_beyaz_is_not_read_as_yaz(self):
        """`beyaz` contains `yaz`; a word-boundary-free match flags winter copy."""
        assert find_out_of_season_words("Beyaz Çikolatalı Lokum", date(2026, 1, 20)) == []

    def test_winter_word_is_caught_in_high_summer(self):
        assert find_out_of_season_words("Kış Menüsü Hazır", date(2026, 7, 14))

    def test_empty_text_is_not_an_error(self):
        assert find_out_of_season_words("", self.SEP) == []
        assert find_out_of_season_words("   ", self.SEP) == []


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


class TestConsistencyCheck:
    """Two sectors, so this is a package rule rather than a restaurant fix."""

    def test_restaurant_batch_with_a_spring_headline_fails(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.context_signal_service.date",
            type("D", (date,), {"today": staticmethod(lambda: date(2026, 9, 2))}),
        )
        report = check_weekly_content(
            _concepts([
                "Serpme Köy Kahvaltımız Bahçede",
                "Güzel Bahar Sofraları İçin Hazırlıklar",
                "Portakal Bahçesinde Akşam Yemeği",
            ]),
            content_pillars=[],
            brand_ctas=[],
        )

        offenders = [i for i in report.issues if i.check == "out_of_season"]
        assert offenders, "spring headline in September must be reported"
        assert offenders[0].severity == "error"
        assert report.passed is False

    def test_local_products_batch_in_season_passes_the_season_check(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.context_signal_service.date",
            type("D", (date,), {"today": staticmethod(lambda: date(2026, 9, 2))}),
        )
        report = check_weekly_content(
            _concepts([
                "Erken Hasat Zeytinyağı Geldi",
                "Yaz Sonu Badem Ezmesi Tazeliği",
                "Sonbahar Hasadına Hazırlık",
            ]),
            content_pillars=[],
            brand_ctas=[],
        )

        assert [i for i in report.issues if i.check == "out_of_season"] == []

    def test_the_offending_headline_is_named_in_the_report(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.context_signal_service.date",
            type("D", (date,), {"today": staticmethod(lambda: date(2026, 9, 2))}),
        )
        report = check_weekly_content(
            _concepts(["Kış Lezzetleri Sofranızda", "Bahçede Kahvaltı"]),
            content_pillars=[],
            brand_ctas=[],
        )

        issue = next(i for i in report.issues if i.check == "out_of_season")
        assert "Kış Lezzetleri" in issue.description
