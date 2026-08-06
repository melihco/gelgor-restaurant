"""Multi-sector slot pack readiness gates (Python SSOT)."""

from __future__ import annotations

from app.crew.industry_playbooks import get_industry_playbook, normalize_industry_id
from app.data.sector_slot_pack import SECTOR_SLOT_PACKS, SLOT_KEYS_BY_SECTOR


READY_PACK_SECTORS = (
    "beach_club",
    "restaurant_cafe",
    "coffee_shop",
    "fine_dining",
    "hospitality",
    "beauty_wellness",
    "barber_salon",
    "healthcare_clinic",
    "wedding_event",
    "kids_party_venue",
    "local_products_shop",
    "ecommerce_retail",
    "fitness_gym",
    "nightclub",
    "fashion_boutique",
    "bakery_patisserie",
    "real_estate",
    "local_service_business",
    "agency_services",
    "jewelry_accessories",
    "general_business",
)


def test_at_least_20_sector_packs():
    assert len(SECTOR_SLOT_PACKS) >= 20
    assert len(SLOT_KEYS_BY_SECTOR) >= 20
    for sector in READY_PACK_SECTORS:
        assert sector in SLOT_KEYS_BY_SECTOR
        assert len(SLOT_KEYS_BY_SECTOR[sector]) >= 12


def test_wedding_photography_optional_tags():
    pack = next(p for p in SECTOR_SLOT_PACKS if p["sector_id"] == "wedding_event")
    photo = [
        i["suffix"]
        for i in pack["instances"]
        if "requires:wedding_photography" in (i.get("optional_tags") or [])
    ]
    assert "couple_portrait_post" in photo
    assert "teaser_film_reel" in photo
    assert len(photo) >= 5


def test_playbook_aliases_resolve_for_pack_sectors():
    # Playbook may use a different key; normalize must not fail / fall to empty.
    for sector in ("beach_club", "wedding_event", "kids_party_venue", "agency_services", "jewelry_accessories"):
        pb = get_industry_playbook(sector)
        assert pb.id
    assert normalize_industry_id("wedding_photography") == "wedding_event"
    assert normalize_industry_id("kids_party") == "kids_party_venue"
    assert normalize_industry_id("cocuk_parti_evi") == "kids_party_venue"
    assert normalize_industry_id("fitness_gym") in {"fitness", "fitness_gym"}
    assert normalize_industry_id("nightclub") in {"nightclub", "nightclub_lounge"}


def test_kids_party_venue_has_birthday_slots():
    keys = SLOT_KEYS_BY_SECTOR["kids_party_venue"]
    assert any("birthday_package" in k for k in keys)
    assert any("theme_room" in k for k in keys)
    assert all("bridal" not in k for k in keys)
