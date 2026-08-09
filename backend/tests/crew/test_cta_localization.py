"""CTA array must follow brand.languages — EN brands never keep TR presets."""

from app.crew.cta_localization import (
    localize_cta,
    pick_localized_cta,
    parse_cta_list,
)


def test_localize_service_profile_presets_to_en():
    assert localize_cta("Rezervasyon Yap", "en") == "Book now"
    assert localize_cta("Masanı Ayır", "en") == "Reserve a table"
    assert localize_cta("Randevu Al", "en") == "Book an appointment"
    assert localize_cta("İncele", "en") == "Explore"
    assert localize_cta("Bizi Ziyaret Et", "en") == "Visit us"


def test_pick_localized_cta_from_tr_array_for_en_brand():
    assert pick_localized_cta(
        ["Rezervasyon Yap", "Masanı Ayır"],
        "en",
    ) == "Book now"


def test_pick_localized_cta_prefers_native_language_entry():
    assert pick_localized_cta(
        ["Rezervasyon Yap", "Book now", "Keşfet"],
        "en",
    ) == "Book now"


def test_pick_localized_cta_keeps_tr_for_tr_brand():
    assert pick_localized_cta(
        '["Rezervasyon Yap", "Keşfet"]',
        "tr",
    ) == "Rezervasyon Yap"


def test_parse_cta_list_json_and_pipe():
    assert parse_cta_list('["Book now", "Discover"]') == ["Book now", "Discover"]
    assert parse_cta_list("Book now | Discover") == ["Book now", "Discover"]
