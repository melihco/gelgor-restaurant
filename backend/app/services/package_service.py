"""
Package service – manages the package-based agent activation system.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.package import Package, PackageAgentAllocation
from app.schemas.package import PackageCreate, PackageUpdate


async def list_packages(db: AsyncSession, tenant_id: uuid.UUID) -> list[Package]:
    result = await db.execute(
        select(Package)
        .options(selectinload(Package.agent_allocations))
        .where(Package.tenant_id == tenant_id, Package.is_active == True)
        .order_by(Package.name)
    )
    return list(result.scalars().all())


async def get_package(db: AsyncSession, package_id: uuid.UUID) -> Package | None:
    result = await db.execute(
        select(Package)
        .options(selectinload(Package.agent_allocations))
        .where(Package.id == package_id)
    )
    return result.scalar_one_or_none()


async def create_package(db: AsyncSession, tenant_id: uuid.UUID, data: PackageCreate) -> Package:
    package = Package(
        tenant_id=tenant_id,
        name=data.name,
        slug=data.slug,
        description=data.description,
        is_default=data.is_default,
        max_workspaces=data.max_workspaces,
        monthly_task_limit=data.monthly_task_limit,
    )
    db.add(package)
    await db.flush()

    for alloc_data in data.agent_allocations:
        alloc = PackageAgentAllocation(
            package_id=package.id,
            agent_role=alloc_data.agent_role,
            is_enabled=alloc_data.is_enabled,
            daily_execution_limit=alloc_data.daily_execution_limit,
            config_json=alloc_data.config_json,
        )
        db.add(alloc)

    await db.flush()
    return package


async def update_package(
    db: AsyncSession, package_id: uuid.UUID, data: PackageUpdate
) -> Package | None:
    package = await get_package(db, package_id)
    if not package:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(package, field, value)
    await db.flush()
    return package
