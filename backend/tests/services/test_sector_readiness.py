"""Sector readiness admin aggregate (unit, no DB)."""

from __future__ import annotations

from app.data.sector_slot_pack import SECTOR_SLOT_PACKS, SLOT_KEYS_BY_SECTOR
from app.services.sector_readiness_service import (
    _PRODUCTION_PROFILE_SECTORS,
    _playbook_resolvable,
    _status_for,
)


def test_every_pack_sector_has_profile_and_playbook():
    assert len(SLOT_KEYS_BY_SECTOR) >= 20
    for sector_id, keys in SLOT_KEYS_BY_SECTOR.items():
        assert len(keys) >= 12
        assert sector_id in _PRODUCTION_PROFILE_SECTORS
        ok, playbook_id = _playbook_resolvable(sector_id)
        assert ok is True
        assert playbook_id


def test_status_for_matrix():
    assert _status_for(
        pack_count=18, db_active=18, has_profile=True, has_playbook=True, in_db_sector=True,
    ) == "full"
    assert _status_for(
        pack_count=18, db_active=10, has_profile=True, has_playbook=True, in_db_sector=True,
    ) == "seed_stale"
    assert _status_for(
        pack_count=18, db_active=18, has_profile=False, has_playbook=True, in_db_sector=True,
    ) == "partial"
    assert _status_for(
        pack_count=5, db_active=5, has_profile=True, has_playbook=True, in_db_sector=True,
    ) == "missing_pack"


def test_pack_list_includes_agency_and_jewelry():
    ids = {p["sector_id"] for p in SECTOR_SLOT_PACKS}
    assert "agency_services" in ids
    assert "jewelry_accessories" in ids
    assert "wedding_event" in ids
    assert "kids_party_venue" in ids
