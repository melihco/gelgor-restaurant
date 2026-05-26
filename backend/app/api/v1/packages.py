from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_tenant_id
from app.schemas.package import PackageCreate, PackageRead, PackageUpdate
from app.services import package_service

router = APIRouter()


@router.get("", response_model=list[PackageRead])
async def list_packages(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    return await package_service.list_packages(db, tenant_id)


@router.get("/{package_id}", response_model=PackageRead)
async def get_package(
    package_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    pkg = await package_service.get_package(db, package_id)
    if not pkg:
        raise HTTPException(404, "Package not found")
    return pkg


@router.post("", response_model=PackageRead, status_code=201)
async def create_package(
    data: PackageCreate,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    return await package_service.create_package(db, tenant_id, data)


@router.patch("/{package_id}", response_model=PackageRead)
async def update_package(
    package_id: uuid.UUID,
    data: PackageUpdate,
    db: AsyncSession = Depends(get_db),
):
    pkg = await package_service.update_package(db, package_id, data)
    if not pkg:
        raise HTTPException(404, "Package not found")
    return pkg
