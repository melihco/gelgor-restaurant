"""Production slot catalog — read/write service."""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crew.industry_playbooks import normalize_industry_id
from app.services.brand_service_profile_service import canonical_sector_from_category
from app.models.brand_context import BrandContext
from app.models.slot_catalog import (
    CanonicalSector,
    ProductionSlotDefinition,
    TenantSlotAssignment,
)

logger = structlog.get_logger()

_DEFAULT_SLOT_FACILITIES: dict[str, bool] = {
    "pool": True,
    "dj_stage": True,
    "full_menu": True,
    "spa": True,
    "outdoor_terrace": True,
    "private_events": True,
    "live_music": True,
    "classes": True,
    "kids_area": True,
    "delivery": True,
}


def _parse_facility_from_tag(tag: str) -> str | None:
    if not tag.startswith("requires:"):
        return None
    key = tag[len("requires:"):]
    return key if key in _DEFAULT_SLOT_FACILITIES else None


async def _load_brand_slot_facilities(db: AsyncSession, workspace_id: uuid.UUID) -> dict[str, bool]:
    """Read brand_theme.slot_facilities — opt-out model (missing keys default True)."""
    result = await db.execute(
        select(BrandContext.brand_theme).where(BrandContext.workspace_id == workspace_id)
    )
    row = result.scalar_one_or_none()
    facilities = dict(_DEFAULT_SLOT_FACILITIES)
    if not isinstance(row, dict):
        return facilities
    raw = row.get("slot_facilities") or row.get("slotFacilities")
    if isinstance(raw, dict):
        for key, value in raw.items():
            if key in facilities and isinstance(value, bool):
                facilities[key] = value
    return facilities


def _slot_enabled_by_facilities(optional_tags: list | None, facilities: dict[str, bool]) -> bool:
    if not optional_tags:
        return True
    for tag in optional_tags:
        facility = _parse_facility_from_tag(str(tag))
        if facility and facilities.get(facility) is False:
            return False
    return True


def _normalize_sector_slug(value: str | None) -> str:
    raw = (value or "").strip().lower().replace(" ", "_").replace("&", "_")
    return normalize_industry_id(raw) if raw else ""


async def resolve_workspace_sector_id(db: AsyncSession, workspace_id: uuid.UUID) -> str | None:
    """Resolve canonical sector_id from brand_service_profile.category or business_type."""
    result = await db.execute(
        select(BrandContext.brand_service_profile, BrandContext.business_type).where(
            BrandContext.workspace_id == workspace_id
        )
    )
    row = result.one_or_none()
    if not row:
        return None

    profile, business_type = row
    category = None
    if isinstance(profile, dict):
        category = profile.get("category")
    elif isinstance(profile, str) and profile.strip():
        try:
            parsed = json.loads(profile)
            if isinstance(parsed, dict):
                category = parsed.get("category")
        except json.JSONDecodeError:
            category = None

    if category:
        candidate = _normalize_sector_slug(canonical_sector_from_category(str(category)))
    else:
        candidate = _normalize_sector_slug(str(business_type or ""))
    if not candidate:
        return None

    sector = await db.get(CanonicalSector, candidate)
    if sector:
        return sector.sector_id

    # Alias lookup
    result = await db.execute(
        select(CanonicalSector).where(CanonicalSector.is_active.is_(True))
    )
    for item in result.scalars().all():
        aliases = [str(a).lower() for a in (item.aliases or [])]
        if candidate in aliases or candidate == item.sector_id:
            return item.sector_id
    return candidate


async def list_sectors(db: AsyncSession, *, active_only: bool = True) -> list[CanonicalSector]:
    q = select(CanonicalSector).order_by(CanonicalSector.sort_order, CanonicalSector.sector_id)
    if active_only:
        q = q.where(CanonicalSector.is_active.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_slot_definitions(
    db: AsyncSession,
    *,
    sector_id: str | None = None,
    active_only: bool = True,
) -> list[ProductionSlotDefinition]:
    q = select(ProductionSlotDefinition).order_by(
        ProductionSlotDefinition.sector_id,
        ProductionSlotDefinition.sort_order,
        ProductionSlotDefinition.slot_key,
    )
    if sector_id:
        q = q.where(ProductionSlotDefinition.sector_id == sector_id)
    if active_only:
        q = q.where(ProductionSlotDefinition.status == "active")
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_slot_definition(
    db: AsyncSession, slot_key: str,
) -> ProductionSlotDefinition | None:
    return await db.get(ProductionSlotDefinition, slot_key)


async def list_tenant_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    enabled_only: bool = False,
) -> list[TenantSlotAssignment]:
    q = (
        select(TenantSlotAssignment)
        .where(TenantSlotAssignment.workspace_id == workspace_id)
        .order_by(TenantSlotAssignment.priority, TenantSlotAssignment.slot_key)
    )
    if enabled_only:
        q = q.where(TenantSlotAssignment.enabled.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_tenant_enabled_slots(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Return enabled assignments joined with slot definitions."""
    assignments = await list_tenant_assignments(db, workspace_id, enabled_only=True)
    if not assignments:
        return []

    keys = [a.slot_key for a in assignments]
    slots_result = await db.execute(
        select(ProductionSlotDefinition).where(ProductionSlotDefinition.slot_key.in_(keys))
    )
    slot_by_key = {s.slot_key: s for s in slots_result.scalars().all()}

    out: list[dict[str, Any]] = []
    for assignment in assignments:
        slot = slot_by_key.get(assignment.slot_key)
        if not slot or slot.status != "active":
            continue
        out.append({
            "assignment": assignment,
            "slot": slot,
        })
    out.sort(key=lambda row: (row["assignment"].priority, row["slot"].sort_order))
    return out


async def bootstrap_tenant_slot_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    sector_id: str | None = None,
    assignment_source: str = "auto_default",
) -> dict[str, Any]:
    """Copy sector enabled_by_default slots into tenant_slot_assignments."""
    resolved_sector = sector_id or await resolve_workspace_sector_id(db, workspace_id)
    if not resolved_sector:
        raise ValueError("workspace sector could not be resolved")

    defaults = await list_slot_definitions(db, sector_id=resolved_sector, active_only=True)
    facilities = await _load_brand_slot_facilities(db, workspace_id)
    defaults = [
        s for s in defaults
        if s.enabled_by_default and _slot_enabled_by_facilities(s.optional_tags, facilities)
    ]
    if not defaults:
        raise ValueError(f"no default slots for sector {resolved_sector}")

    existing_result = await db.execute(
        select(TenantSlotAssignment).where(TenantSlotAssignment.workspace_id == workspace_id)
    )
    existing = {row.slot_key: row for row in existing_result.scalars().all()}

    created = 0
    updated = 0
    for idx, slot in enumerate(defaults):
        priority = (idx + 1) * 10
        current = existing.get(slot.slot_key)
        if current:
            if current.assignment_source == "operator":
                continue
            current.enabled = True
            current.priority = priority
            current.assignment_source = assignment_source
            updated += 1
        else:
            db.add(
                TenantSlotAssignment(
                    workspace_id=workspace_id,
                    slot_key=slot.slot_key,
                    enabled=True,
                    priority=priority,
                    assignment_source=assignment_source,
                )
            )
            created += 1

    await db.flush()
    enabled_count = len([s for s in defaults])
    logger.info(
        "tenant_slot_bootstrap",
        workspace_id=str(workspace_id),
        sector_id=resolved_sector,
        created=created,
        updated=updated,
        enabled_count=enabled_count,
    )
    return {
        "workspace_id": workspace_id,
        "sector_id": resolved_sector,
        "created": created,
        "updated": updated,
        "enabled_count": enabled_count,
    }


async def upsert_tenant_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    assignments: list[dict[str, Any]],
) -> list[TenantSlotAssignment]:
    """Bulk upsert operator/onboarding slot assignments."""
    out: list[TenantSlotAssignment] = []
    for item in assignments:
        slot_key = str(item["slot_key"])
        slot = await get_slot_definition(db, slot_key)
        if not slot:
            raise ValueError(f"unknown slot_key: {slot_key}")

        result = await db.execute(
            select(TenantSlotAssignment).where(
                TenantSlotAssignment.workspace_id == workspace_id,
                TenantSlotAssignment.slot_key == slot_key,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.enabled = bool(item.get("enabled", True))
            row.priority = int(item.get("priority", row.priority))
            row.assignment_source = str(item.get("assignment_source", "operator"))
            row.notes = item.get("notes")
            out.append(row)
        else:
            row = TenantSlotAssignment(
                workspace_id=workspace_id,
                slot_key=slot_key,
                enabled=bool(item.get("enabled", True)),
                priority=int(item.get("priority", 100)),
                assignment_source=str(item.get("assignment_source", "operator")),
                notes=item.get("notes"),
            )
            db.add(row)
            out.append(row)
    await db.flush()
    return out
