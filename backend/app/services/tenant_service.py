"""
Tenant service – CRUD operations for tenant management.
"""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantUpdate


async def get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    return result.scalar_one_or_none()


async def get_tenant_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    return result.scalar_one_or_none()


async def list_tenants(
    db: AsyncSession,
    *,
    q: str | None = None,
    include_inactive: bool = False,
) -> list[Tenant]:
    stmt = select(Tenant).order_by(Tenant.name)
    if not include_inactive:
        stmt = stmt.where(Tenant.is_active.is_(True))
    needle = (q or "").strip()
    if needle:
        like = f"%{needle}%"
        stmt = stmt.where(
            or_(
                Tenant.name.ilike(like),
                Tenant.slug.ilike(like),
                Tenant.contact_email.ilike(like),
            )
        )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_tenant(db: AsyncSession, data: TenantCreate) -> Tenant:
    tenant = Tenant(
        name=data.name,
        slug=data.slug,
        contact_email=data.contact_email,
        logo_url=data.logo_url,
    )
    db.add(tenant)
    await db.flush()
    return tenant


async def update_tenant(db: AsyncSession, tenant_id: uuid.UUID, data: TenantUpdate) -> Tenant | None:
    tenant = await get_tenant(db, tenant_id)
    if not tenant:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    await db.flush()
    return tenant
