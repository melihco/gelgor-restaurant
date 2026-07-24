"""
Platform brand registry — list/filter brand_contexts for admin screens.

Cross-tenant read model for sector + brand management. Does not invent Nexus
tenant rows; workspace_id mirrors the Nexus tenant UUID.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_context import BrandContext
from app.services.brand_service_profile_service import canonical_sector_from_category
from app.crew.industry_playbooks import normalize_industry_id


def _normalize_sector_slug(value: str | None) -> str:
    raw = (value or "").strip().lower().replace(" ", "_").replace("&", "_")
    return normalize_industry_id(raw) if raw else ""


def resolve_brand_sector_id(ctx: BrandContext) -> str | None:
    """Resolve sector from brand_service_profile.category or business_type."""
    profile = ctx.brand_service_profile
    category = None
    if isinstance(profile, dict):
        category = profile.get("category")
    if category:
        return _normalize_sector_slug(canonical_sector_from_category(str(category))) or None
    return _normalize_sector_slug(str(ctx.business_type or "")) or None


def brand_row_matches_filters(
    row: dict[str, Any],
    *,
    q: str | None = None,
    sector_id: str | None = None,
) -> bool:
    if sector_id:
        want = _normalize_sector_slug(sector_id)
        got = _normalize_sector_slug(str(row.get("sector_id") or ""))
        if want and got != want:
            return False
    needle = (q or "").strip().lower()
    if needle:
        hay = " ".join(
            [
                str(row.get("business_name") or ""),
                str(row.get("business_type") or ""),
                str(row.get("instagram_handle") or ""),
                str(row.get("location") or ""),
                str(row.get("workspace_id") or ""),
            ]
        ).lower()
        if needle not in hay:
            return False
    return True


def serialize_brand_registry_row(ctx: BrandContext) -> dict[str, Any]:
    sector_id = resolve_brand_sector_id(ctx)
    return {
        "workspace_id": ctx.workspace_id,
        "business_name": ctx.business_name,
        "business_type": ctx.business_type,
        "sector_id": sector_id,
        "location": ctx.location,
        "instagram_handle": ctx.instagram_handle,
        "website_url": ctx.website_url,
        "languages": ctx.languages,
        "brand_tone": (ctx.brand_tone or "")[:160] or None,
        "updated_at": ctx.updated_at,
        "created_at": ctx.created_at,
    }


async def list_platform_brands(
    db: AsyncSession,
    *,
    q: str | None = None,
    sector_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))

    stmt = select(BrandContext).order_by(
        BrandContext.business_name.asc(),
        BrandContext.workspace_id.asc(),
    )
    result = await db.execute(stmt)
    serialized = [serialize_brand_registry_row(ctx) for ctx in result.scalars().all()]
    filtered = [
        row for row in serialized
        if brand_row_matches_filters(row, q=q, sector_id=sector_id)
    ]

    total = len(filtered)
    page = filtered[offset: offset + limit]
    return {
        "items": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


async def get_platform_brand(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> dict[str, Any] | None:
    result = await db.execute(
        select(BrandContext).where(BrandContext.workspace_id == workspace_id)
    )
    ctx = result.scalar_one_or_none()
    if not ctx:
        return None
    return serialize_brand_registry_row(ctx)


async def count_brands_by_sector(db: AsyncSession) -> dict[str, int]:
    result = await db.execute(select(BrandContext))
    counts: dict[str, int] = {}
    for ctx in result.scalars().all():
        sector = resolve_brand_sector_id(ctx) or "unknown"
        counts[sector] = counts.get(sector, 0) + 1
    return counts


async def build_sector_coverage(
    db: AsyncSession,
    sector_id: str,
) -> dict[str, Any]:
    """Slot catalog coverage for one sector (admin sector management screen)."""
    from app.models.slot_catalog import CanonicalSector, ProductionSlotDefinition
    from app.services.slot_catalog_service import LIBRARY_SHELF_SPECS

    sector = await db.get(CanonicalSector, sector_id)
    if not sector:
        raise ValueError(f"unknown_sector: {sector_id}")

    result = await db.execute(
        select(ProductionSlotDefinition).where(
            ProductionSlotDefinition.sector_id == sector_id,
            ProductionSlotDefinition.owner_workspace_id.is_(None),
        )
    )
    slots = list(result.scalars().all())
    active = [s for s in slots if s.status == "active"]
    archived = [s for s in slots if s.status != "active"]

    by_format: dict[str, int] = {}
    by_library: dict[str, int] = {}
    by_template_type: dict[str, int] = {}
    for s in active:
        by_format[s.format] = by_format.get(s.format, 0) + 1
        lib = s.library_slot_key or "_none"
        by_library[lib] = by_library.get(lib, 0) + 1
        by_template_type[s.design_template_type] = (
            by_template_type.get(s.design_template_type, 0) + 1
        )

    shelves = []
    for spec in LIBRARY_SHELF_SPECS:
        key = spec["key"]
        shelves.append({
            **spec,
            "active_count": by_library.get(key, 0),
        })

    brand_counts = await count_brands_by_sector(db)

    return {
        "sector_id": sector.sector_id,
        "label_tr": sector.label_tr,
        "label_en": sector.label_en,
        "is_active": sector.is_active,
        "total_slots": len(slots),
        "active_slots": len(active),
        "archived_slots": len(archived),
        "enabled_by_default_count": sum(1 for s in active if s.enabled_by_default),
        "by_format": by_format,
        "by_design_template_type": by_template_type,
        "shelves": shelves,
        "brand_count": int(brand_counts.get(sector_id, 0)),
    }
