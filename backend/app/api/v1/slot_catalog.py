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
    BrandSlotFacilitiesOut,
    BrandSlotFacilitiesUpdateRequest,
    BrandSlotFacilitiesUpdateResponse,
    BulkTenantSlotAssignmentRequest,
    CanonicalSectorOut,
    FacilityOptionOut,
    LibraryShelfOut,
    ProductionSlotDefinitionOut,
    ResetTenantSlotsRequest,
    ResetTenantSlotsResponse,
    ShelfSummaryOut,
    SyncFacilitiesToAssignmentsResponse,
    SyncSlotCatalogSeedResponse,
    TenantSlotAdminOverviewOut,
    TenantSlotAssignmentOut,
    TenantSlotEffectiveOut,
    TenantSlotPreviewOut,
    TenantSlotPreviewRequest,
    CoverageOut,
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
        optional_tags=list(row.optional_tags or []),
        enabled_by_default=row.enabled_by_default,
        sort_order=row.sort_order,
        status=row.status,
    )


def _facility_options(options: list[dict]) -> list[FacilityOptionOut]:
    return [FacilityOptionOut(**opt) for opt in options]


def _coverage_out(coverage: dict) -> CoverageOut:
    return CoverageOut(**coverage)


def _shelf_out(row: dict) -> ShelfSummaryOut:
    return ShelfSummaryOut(**row)


def _effective_slot_out(row: dict) -> TenantSlotEffectiveOut:
    return TenantSlotEffectiveOut(
        slot_key=row["slot_key"],
        slot=_slot_out(row["slot"]),
        assigned=row["assigned"],
        assignment_enabled=row.get("assignment_enabled"),
        assignment_source=row.get("assignment_source"),
        priority=row.get("priority"),
        facility_blocked=row["facility_blocked"],
        required_facilities=list(row.get("required_facilities") or []),
        effective_enabled=row["effective_enabled"],
        blocked_by=row.get("blocked_by"),
    )


def _overview_out(data: dict) -> TenantSlotAdminOverviewOut:
    return TenantSlotAdminOverviewOut(
        workspace_id=data["workspace_id"],
        sector_id=data.get("sector_id"),
        facilities=dict(data["facilities"]),
        facility_options=_facility_options(data["facility_options"]),
        shelves=[_shelf_out(s) for s in data["shelves"]],
        slots=[_effective_slot_out(s) for s in data["slots"]],
        coverage=_coverage_out(data["coverage"]),
        assignment_row_count=int(data["assignment_row_count"]),
        using_sector_defaults=bool(data["using_sector_defaults"]),
    )


@router.get("/library-shelves", response_model=list[LibraryShelfOut])
async def list_library_shelves():
    """Fixed 7-shelf legend (code SSOT). Not tenant-mutable."""
    return [LibraryShelfOut(**row) for row in svc.list_library_shelves()]


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
    slots = await svc.list_slot_definitions(db, active_only=False) if slot_keys else []
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
    validate_coverage: bool = False,
    db: AsyncSession = Depends(get_db),
):
    try:
        rows = await svc.upsert_tenant_assignments(
            db,
            workspace_id,
            [item.model_dump() for item in body.assignments],
            validate_coverage=validate_coverage,
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
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/tenants/{workspace_id}/facilities", response_model=BrandSlotFacilitiesOut)
async def get_tenant_slot_facilities(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    facilities = await svc.load_brand_slot_facilities(db, workspace_id)
    sector_id = await svc.resolve_workspace_sector_id(db, workspace_id)
    return BrandSlotFacilitiesOut(
        workspace_id=workspace_id,
        sector_id=sector_id,
        facilities=facilities,
        options=_facility_options(svc.facility_options(facilities)),
        defaults=svc.default_slot_facilities(),
    )


@router.put("/tenants/{workspace_id}/facilities", response_model=BrandSlotFacilitiesUpdateResponse)
async def put_tenant_slot_facilities(
    workspace_id: uuid.UUID,
    body: BrandSlotFacilitiesUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await svc.update_brand_slot_facilities(
            db,
            workspace_id,
            body.facilities,
            sync_assignments=body.sync_assignments,
        )
        await db.commit()
        return BrandSlotFacilitiesUpdateResponse(
            workspace_id=result["workspace_id"],
            sector_id=result.get("sector_id"),
            facilities=result["facilities"],
            options=_facility_options(result["options"]),
            synced_disabled=int(result.get("synced_disabled") or 0),
            coverage_ok=bool(result.get("coverage_ok", True)),
            coverage_errors=list(result.get("coverage_errors") or []),
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/tenants/{workspace_id}/overview", response_model=TenantSlotAdminOverviewOut)
async def get_tenant_slot_overview(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    data = await svc.build_tenant_slot_overview(db, workspace_id)
    return _overview_out(data)


@router.post("/tenants/{workspace_id}/preview", response_model=TenantSlotPreviewOut)
async def preview_tenant_slot_changes(
    workspace_id: uuid.UUID,
    body: TenantSlotPreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        data = await svc.preview_tenant_slot_changes(
            db,
            workspace_id,
            facilities_patch=body.facilities,
            assignments_override=(
                [item.model_dump() for item in body.assignments]
                if body.assignments is not None
                else None
            ),
        )
        return TenantSlotPreviewOut(
            workspace_id=data["workspace_id"],
            sector_id=data.get("sector_id"),
            facilities=dict(data["facilities"]),
            shelves=[_shelf_out(s) for s in data["shelves"]],
            slots=[_effective_slot_out(s) for s in data["slots"]],
            coverage=_coverage_out(data["coverage"]),
            would_enable=list(data.get("would_enable") or []),
            would_disable_by_assignment=list(data.get("would_disable_by_assignment") or []),
            would_disable_by_facility=list(data.get("would_disable_by_facility") or []),
            recommended_disable_by_facility=list(
                data.get("recommended_disable_by_facility") or []
            ),
            using_sector_defaults=bool(data.get("using_sector_defaults")),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/tenants/{workspace_id}/sync-facilities",
    response_model=SyncFacilitiesToAssignmentsResponse,
)
async def sync_tenant_facilities_to_assignments(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await svc.sync_facilities_to_assignments(db, workspace_id)
        await db.commit()
        return SyncFacilitiesToAssignmentsResponse(
            workspace_id=result["workspace_id"],
            sector_id=result.get("sector_id"),
            disabled=int(result["disabled"]),
            disabled_slot_keys=list(result.get("disabled_slot_keys") or []),
            coverage=_coverage_out(result["coverage"]),
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/tenants/{workspace_id}/reset-defaults", response_model=ResetTenantSlotsResponse)
async def reset_tenant_slot_defaults(
    workspace_id: uuid.UUID,
    body: ResetTenantSlotsRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    payload = body or ResetTenantSlotsRequest()
    try:
        result = await svc.reset_tenant_slot_defaults(
            db,
            workspace_id,
            sector_id=payload.sector_id,
            reset_facilities=payload.reset_facilities,
            reset_assignments=payload.reset_assignments,
            force_operator=payload.force_operator,
        )
        await db.commit()
        return ResetTenantSlotsResponse(**result)
    except ValueError as exc:
        await db.rollback()
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
