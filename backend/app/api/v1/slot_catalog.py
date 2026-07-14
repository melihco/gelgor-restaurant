"""Production slot catalog API — sectors, slot definitions, tenant assignments."""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.deps import verify_internal_api_key
from app.schemas.slot_catalog import (
    BootstrapTenantSlotsResponse,
    BulkTenantSlotAssignmentRequest,
    CanonicalSectorOut,
    ProductionSlotDefinitionOut,
    SyncSlotCatalogSeedResponse,
    TenantSlotAssignmentOut,
)
from app.models.slot_catalog import CanonicalSector, ProductionSlotDefinition
from app.services import slot_catalog_service as svc

logger = structlog.get_logger()

router = APIRouter()


def _sector_out(row) -> CanonicalSectorOut:
    return CanonicalSectorOut(
        sector_id=row.sector_id,
        label_tr=row.label_tr,
        label_en=row.label_en,
        aliases=list(row.aliases or []),
        is_active=row.is_active,
        sort_order=row.sort_order,
    )


def _slot_out(row) -> ProductionSlotDefinitionOut:
    return ProductionSlotDefinitionOut(
        slot_key=row.slot_key,
        sector_id=row.sector_id,
        label_tr=row.label_tr,
        label_en=row.label_en,
        format=row.format,
        pipeline=row.pipeline,
        slot_role=row.slot_role,
        design_template_type=row.design_template_type,
        library_slot_key=row.library_slot_key,
        tier=row.tier,
        match_signals=dict(row.match_signals or {}),
        prompt_pack=dict(row.prompt_pack or {}),
        enabled_by_default=row.enabled_by_default,
        sort_order=row.sort_order,
        status=row.status,
    )


@router.get("/sectors", response_model=list[CanonicalSectorOut])
async def list_catalog_sectors(db: AsyncSession = Depends(get_db)):
    rows = await svc.list_sectors(db)
    return [_sector_out(r) for r in rows]


@router.get("/sectors/{sector_id}/slots", response_model=list[ProductionSlotDefinitionOut])
async def list_sector_slots(sector_id: str, db: AsyncSession = Depends(get_db)):
    sector = await db.get(CanonicalSector, sector_id)
    if not sector:
        raise HTTPException(status_code=404, detail=f"unknown sector: {sector_id}")
    rows = await svc.list_slot_definitions(db, sector_id=sector_id)
    return [_slot_out(r) for r in rows]


@router.get("/slots", response_model=list[ProductionSlotDefinitionOut])
async def list_all_slots(
    sector_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    rows = await svc.list_slot_definitions(db, sector_id=sector_id)
    return [_slot_out(r) for r in rows]


@router.get("/tenants/{workspace_id}/assignments", response_model=list[TenantSlotAssignmentOut])
async def list_tenant_slot_assignments(
    workspace_id: uuid.UUID,
    enabled_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    assignments = await svc.list_tenant_assignments(db, workspace_id, enabled_only=enabled_only)
    slot_keys = [a.slot_key for a in assignments]
    slots = await svc.list_slot_definitions(db) if slot_keys else []
    slot_map = {s.slot_key: s for s in slots if s.slot_key in slot_keys}

    out: list[TenantSlotAssignmentOut] = []
    for a in assignments:
        slot_row = slot_map.get(a.slot_key)
        out.append(
            TenantSlotAssignmentOut(
                id=a.id,
                workspace_id=a.workspace_id,
                slot_key=a.slot_key,
                enabled=a.enabled,
                priority=a.priority,
                assignment_source=a.assignment_source,
                notes=a.notes,
                slot=_slot_out(slot_row) if slot_row else None,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
        )
    return out


@router.post("/tenants/{workspace_id}/bootstrap", response_model=BootstrapTenantSlotsResponse)
async def bootstrap_tenant_slots(
    workspace_id: uuid.UUID,
    sector_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await svc.bootstrap_tenant_slot_assignments(
            db, workspace_id, sector_id=sector_id,
        )
        await db.commit()
        return BootstrapTenantSlotsResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/tenants/{workspace_id}/assignments", response_model=list[TenantSlotAssignmentOut])
async def upsert_tenant_slot_assignments(
    workspace_id: uuid.UUID,
    body: BulkTenantSlotAssignmentRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        rows = await svc.upsert_tenant_assignments(
            db,
            workspace_id,
            [item.model_dump() for item in body.assignments],
        )
        await db.commit()
        return [
            TenantSlotAssignmentOut(
                id=r.id,
                workspace_id=r.workspace_id,
                slot_key=r.slot_key,
                enabled=r.enabled,
                priority=r.priority,
                assignment_source=r.assignment_source,
                notes=r.notes,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/sync-seed",
    response_model=SyncSlotCatalogSeedResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
async def sync_slot_catalog_seed(db: AsyncSession = Depends(get_db)):
    """Upsert canonical_sectors + production_slot_definitions from sector_slot_pack (live ops)."""
    from sqlalchemy import select

    from scripts.seed_production_slot_catalog import seed_sectors, seed_slots

    sectors = await seed_sectors(db)
    slots = await seed_slots(db)
    await db.commit()
    total = len((await db.execute(select(ProductionSlotDefinition))).scalars().all())
    logger.info("slot_catalog_sync_seed", sectors=sectors, slots=slots, total=total)
    return SyncSlotCatalogSeedResponse(
        sectors_touched=sectors,
        slots_touched=slots,
        total_definitions=total,
    )
