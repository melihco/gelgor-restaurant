from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_tenant_id
from app.schemas.tenant import TenantCreate, TenantRead, TenantUpdate
from app.services import tenant_service

router = APIRouter()


@router.get("", response_model=list[TenantRead])
async def list_tenants(
    q: str | None = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await tenant_service.list_tenants(
        db, q=q, include_inactive=include_inactive,
    )


@router.get("/me", response_model=TenantRead)
async def get_current_tenant(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    tenant = await tenant_service.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    return tenant


@router.get("/{tenant_id}", response_model=TenantRead)
async def get_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    tenant = await tenant_service.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    return tenant


@router.post("", response_model=TenantRead, status_code=201)
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await tenant_service.get_tenant_by_slug(db, data.slug)
    if existing:
        raise HTTPException(409, "Tenant with this slug already exists")
    tenant = await tenant_service.create_tenant(db, data)
    await db.commit()
    return tenant


@router.patch("/{tenant_id}", response_model=TenantRead)
async def update_tenant(
    tenant_id: uuid.UUID,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
):
    tenant = await tenant_service.update_tenant(db, tenant_id, data)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    await db.commit()
    return tenant


@router.post("/{tenant_id}/suspend", response_model=TenantRead)
async def suspend_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    tenant = await tenant_service.update_tenant(
        db, tenant_id, TenantUpdate(is_active=False),
    )
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    await db.commit()
    return tenant


@router.post("/{tenant_id}/reactivate", response_model=TenantRead)
async def reactivate_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    tenant = await tenant_service.update_tenant(
        db, tenant_id, TenantUpdate(is_active=True),
    )
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    await db.commit()
    return tenant
