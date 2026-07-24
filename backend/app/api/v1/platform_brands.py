"""Platform brand registry — cross-tenant list for admin brand/sector screens."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.platform_brands import (
    PlatformBootstrapOut,
    PlatformBootstrapRequest,
    PlatformBrandListOut,
    PlatformBrandOut,
    SectorBrandCountOut,
)
from app.services import platform_bootstrap, platform_brand_registry as registry

router = APIRouter()


@router.get("/brands", response_model=PlatformBrandListOut)
async def list_platform_brands(
    q: str | None = Query(None, description="Search name, type, handle, location, workspace id"),
    sector_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    data = await registry.list_platform_brands(
        db, q=q, sector_id=sector_id, limit=limit, offset=offset,
    )
    return PlatformBrandListOut(
        items=[PlatformBrandOut(**row) for row in data["items"]],
        total=data["total"],
        limit=data["limit"],
        offset=data["offset"],
    )


@router.get("/brands/{workspace_id}", response_model=PlatformBrandOut)
async def get_platform_brand(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    row = await registry.get_platform_brand(db, workspace_id)
    if not row:
        raise HTTPException(status_code=404, detail="brand not found")
    return PlatformBrandOut(**row)


@router.get("/brands-by-sector", response_model=list[SectorBrandCountOut])
async def list_brand_counts_by_sector(db: AsyncSession = Depends(get_db)):
    counts = await registry.count_brands_by_sector(db)
    return [
        SectorBrandCountOut(sector_id=k, brand_count=v)
        for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


@router.post("/bootstrap", response_model=PlatformBootstrapOut)
async def bootstrap_platform_workspace(
    body: PlatformBootstrapRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Idempotent Python-side bootstrap for a Nexus tenant UUID:
    mirror tenant/workspace, brand_context stub, optional slot assignments.
    """
    try:
        result = await platform_bootstrap.bootstrap_platform_workspace(
            db,
            workspace_id=body.workspace_id,
            business_name=body.business_name,
            business_type=body.business_type,
            sector_id=body.sector_id,
            location=body.location,
            languages=body.languages,
            website_url=body.website_url,
            instagram_handle=body.instagram_handle,
            bootstrap_slots=body.bootstrap_slots,
            create_brand_stub=body.create_brand_stub,
        )
        await db.commit()
        return PlatformBootstrapOut(**result)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
