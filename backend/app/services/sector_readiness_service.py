"""Sector production-readiness aggregate for platform admin."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crew.industry_playbooks import INDUSTRY_PLAYBOOKS, normalize_industry_id
from app.data.sector_slot_pack import SECTOR_SLOT_PACKS, SLOT_KEYS_BY_SECTOR
from app.models.slot_catalog import CanonicalSector, ProductionSlotDefinition

# Mirrors apps/web sector-production-profile PROFILE_MAP keys that have a slot pack.
# Keep aligned when adding packs — profile-without-pack sectors stay out of READY.
_PRODUCTION_PROFILE_SECTORS = frozenset({
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
})

_MIN_PACK_SLOTS = 12


def _playbook_resolvable(sector_id: str) -> tuple[bool, str]:
    resolved = normalize_industry_id(sector_id)
    if resolved in INDUSTRY_PLAYBOOKS:
        return True, resolved
    # normalize may fall through to local_service_business for unknowns
    if sector_id in INDUSTRY_PLAYBOOKS:
        return True, sector_id
    return False, resolved


def _status_for(
    *,
    pack_count: int,
    db_active: int,
    has_profile: bool,
    has_playbook: bool,
    in_db_sector: bool,
) -> str:
    if pack_count < _MIN_PACK_SLOTS:
        return "missing_pack"
    if not has_profile or not has_playbook:
        return "partial"
    if not in_db_sector or db_active < pack_count:
        return "seed_stale"
    return "full"


async def build_sector_readiness_report(db: AsyncSession) -> dict[str, Any]:
    """Aggregate pack SSOT + DB seed + playbook/profile readiness for admin UI."""
    pack_by_id = {p["sector_id"]: p for p in SECTOR_SLOT_PACKS}
    expected_slots = sum(len(v) for v in SLOT_KEYS_BY_SECTOR.values())
    expected_sectors = len(SLOT_KEYS_BY_SECTOR)

    db_sectors = {
        row.sector_id: row
        for row in (
            await db.execute(select(CanonicalSector))
        ).scalars().all()
    }

    counts_result = await db.execute(
        select(
            ProductionSlotDefinition.sector_id,
            func.count().label("total"),
            func.count()
            .filter(ProductionSlotDefinition.status == "active")
            .label("active"),
            func.count()
            .filter(
                ProductionSlotDefinition.status == "active",
                ProductionSlotDefinition.owner_workspace_id.is_(None),
            )
            .label("active_global"),
        )
        .group_by(ProductionSlotDefinition.sector_id)
    )
    db_counts = {
        row.sector_id: {
            "total": int(row.total or 0),
            "active": int(row.active or 0),
            "active_global": int(row.active_global or 0),
        }
        for row in counts_result.all()
    }

    sectors_out: list[dict[str, Any]] = []
    full_count = 0

    for sector_id in sorted(SLOT_KEYS_BY_SECTOR.keys()):
        pack = pack_by_id[sector_id]
        pack_keys = SLOT_KEYS_BY_SECTOR[sector_id]
        pack_count = len(pack_keys)
        formats: dict[str, int] = {}
        for inst in pack["instances"]:
            fmt = str(inst.get("format") or "post")
            formats[fmt] = formats.get(fmt, 0) + 1

        has_profile = sector_id in _PRODUCTION_PROFILE_SECTORS
        has_playbook, playbook_id = _playbook_resolvable(sector_id)
        db_row = db_sectors.get(sector_id)
        counts = db_counts.get(sector_id, {"total": 0, "active": 0, "active_global": 0})
        db_active = int(counts["active_global"])
        status = _status_for(
            pack_count=pack_count,
            db_active=db_active,
            has_profile=has_profile,
            has_playbook=has_playbook,
            in_db_sector=db_row is not None and bool(db_row.is_active),
        )
        if status == "full":
            full_count += 1

        sectors_out.append({
            "sector_id": sector_id,
            "label_tr": pack.get("label_tr") or (db_row.label_tr if db_row else sector_id),
            "label_en": pack.get("label_en") or (db_row.label_en if db_row else sector_id),
            "aliases": list(pack.get("aliases") or []),
            "pack_slot_count": pack_count,
            "db_active_global_slots": db_active,
            "db_total_slots": int(counts["total"]),
            "formats": formats,
            "has_production_profile": has_profile,
            "has_industry_playbook": has_playbook,
            "playbook_id": playbook_id,
            "seeded_in_db": db_row is not None,
            "db_sector_active": bool(db_row.is_active) if db_row else False,
            "status": status,
            "ready": status == "full",
            "min_pack_slots": _MIN_PACK_SLOTS,
        })

    global_active = await db.scalar(
        select(func.count())
        .select_from(ProductionSlotDefinition)
        .where(
            ProductionSlotDefinition.owner_workspace_id.is_(None),
            ProductionSlotDefinition.status == "active",
        )
    )
    db_sector_count = await db.scalar(select(func.count()).select_from(CanonicalSector))

    return {
        "target_full_sectors": expected_sectors,
        "full_count": full_count,
        "ready": full_count >= expected_sectors and int(global_active or 0) >= expected_slots,
        "expected_pack_sectors": expected_sectors,
        "expected_pack_slots": expected_slots,
        "db_sector_count": int(db_sector_count or 0),
        "db_active_global_slots": int(global_active or 0),
        "seed_ok": (
            int(db_sector_count or 0) >= expected_sectors
            and int(global_active or 0) >= expected_slots
        ),
        "sectors": sectors_out,
    }
