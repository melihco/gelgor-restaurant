"""
Seed data for production slot catalog — generated from sector_slot_pack.py.

Sector IDs must match apps/web/src/lib/sector-production-profile.ts and sector-slot-pack.ts.
"""

from __future__ import annotations

from app.data.sector_slot_pack import (
    OPTIONAL_TAGS_BY_SLOT,
    SECTOR_SEED,
    SLOT_INSTANCE_BY_KEY,
    SLOT_KEYS_BY_SECTOR,
)

__all__ = ["SECTOR_SEED", "SLOT_KEYS_BY_SECTOR", "OPTIONAL_TAGS_BY_SLOT", "SLOT_INSTANCE_BY_KEY"]
