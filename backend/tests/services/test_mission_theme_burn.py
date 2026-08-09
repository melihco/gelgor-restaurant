"""Unit tests for durable burned mission themes."""

from app.services.strategist_service import (
    _burned_mission_theme_labels,
    _detect_mission_theme_labels,
)


def test_detect_local_product_theme_clusters() -> None:
    assert "Erken hasat / zeytinyağı" in _detect_mission_theme_labels(
        "Erken Hasat Zeytinyağı Hasadı Hikayesi"
    )
    assert "Bal / badem hediye" in _detect_mission_theme_labels(
        "Bal ve Badem Hediyelik Setleri Tanıtımı"
    )
    assert "Kahvaltı sofrası" in _detect_mission_theme_labels(
        "Doğal Kahvaltı Sofrası ve Müşteri Deneyimleri"
    )


def test_burned_labels_from_recent_titles() -> None:
    burned = _burned_mission_theme_labels(
        [
            "Erken Hasat Zeytinyağı Hikaye Paylaşımı",
            "Bal ve Badem Hediyelik Setleri Tanıtımı",
        ]
    )
    assert "Erken hasat / zeytinyağı" in burned
    assert "Bal / badem hediye" in burned


def test_instagram_refreshed_at_parser() -> None:
    from app.services.instagram_intelligence_service import _parse_refreshed_at

    assert _parse_refreshed_at(None) is None
    assert _parse_refreshed_at({"refreshed_at": "2026-08-01T12:00:00Z"}) is not None
