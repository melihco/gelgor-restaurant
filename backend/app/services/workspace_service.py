"""
Workspace service – manages brand workspaces within a tenant.

When a workspace is assigned a package, agent instances are automatically
provisioned based on the package's agent allocations.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tenant import Tenant
from app.models.workspace import Workspace
from app.models.package import Package, PackageAgentAllocation
from app.models.agent_config import AgentDefinition, AgentInstance
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate


async def list_workspaces(db: AsyncSession, tenant_id: uuid.UUID) -> list[Workspace]:
    result = await db.execute(
        select(Workspace)
        .where(Workspace.tenant_id == tenant_id, Workspace.is_active == True)
        .order_by(Workspace.name)
    )
    return list(result.scalars().all())


async def get_workspace(db: AsyncSession, workspace_id: uuid.UUID) -> Workspace | None:
    result = await db.execute(
        select(Workspace)
        .options(
            selectinload(Workspace.brand_context),
            selectinload(Workspace.agent_instances).selectinload(AgentInstance.definition),
            selectinload(Workspace.integrations),
        )
        .where(Workspace.id == workspace_id)
    )
    return result.scalar_one_or_none()


async def ensure_nexus_mirror_workspace(db: AsyncSession, nexus_tenant_id: uuid.UUID) -> Workspace:
    """
    BFF / web clients pass the Nexus tenant UUID as the path ``workspace_id``.
    That id must exist on ``workspaces`` (and ``tenants``) for brand_context FKs.
    Upsert placeholder rows using the same UUID for tenant id, workspace id, and
    workspace.tenant_id so new Nexus tenants work without a separate provisioning job.
    """
    existing = await get_workspace(db, nexus_tenant_id)
    if existing:
        return existing

    hex_id = nexus_tenant_id.hex
    await db.execute(
        pg_insert(Tenant)
        .values(
            id=nexus_tenant_id,
            name="Nexus tenant",
            slug=f"t-{hex_id}",
            contact_email=f"nexus+{hex_id}@placeholder.local",
        )
        .on_conflict_do_nothing(index_elements=[Tenant.id])
    )
    await db.execute(
        pg_insert(Workspace)
        .values(
            id=nexus_tenant_id,
            tenant_id=nexus_tenant_id,
            name="Default workspace",
            slug=f"w-{hex_id}",
            package_id=None,
            is_active=True,
        )
        .on_conflict_do_nothing(index_elements=[Workspace.id])
    )

    ws = await get_workspace(db, nexus_tenant_id)
    if ws is None:
        raise RuntimeError(f"Failed to provision workspace mirror for {nexus_tenant_id}")
    return ws


async def create_workspace(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    data: WorkspaceCreate,
) -> Workspace:
    workspace = Workspace(
        tenant_id=tenant_id,
        name=data.name,
        slug=data.slug,
        package_id=data.package_id,
    )
    db.add(workspace)
    await db.flush()

    if data.package_id:
        await _provision_agents_for_package(db, workspace)

    return workspace


async def update_workspace(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    data: WorkspaceUpdate,
) -> Workspace | None:
    workspace = await get_workspace(db, workspace_id)
    if not workspace:
        return None

    old_package_id = workspace.package_id

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(workspace, field, value)
    await db.flush()

    if data.package_id and data.package_id != old_package_id:
        await _provision_agents_for_package(db, workspace)

    return workspace


async def _provision_agents_for_package(db: AsyncSession, workspace: Workspace) -> None:
    """
    When a workspace gets a new package, create AgentInstance records
    for each agent role allocated in that package. This is how the
    package system activates agents for a workspace.
    """
    if not workspace.package_id:
        return

    result = await db.execute(
        select(PackageAgentAllocation)
        .where(PackageAgentAllocation.package_id == workspace.package_id)
    )
    allocations = result.scalars().all()

    for alloc in allocations:
        if not alloc.is_enabled:
            continue

        def_result = await db.execute(
            select(AgentDefinition)
            .where(AgentDefinition.role_key == alloc.agent_role)
        )
        definition = def_result.scalar_one_or_none()
        if not definition:
            continue

        existing = await db.execute(
            select(AgentInstance)
            .where(
                AgentInstance.workspace_id == workspace.id,
                AgentInstance.definition_id == definition.id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        instance = AgentInstance(
            workspace_id=workspace.id,
            definition_id=definition.id,
            is_enabled=True,
        )
        db.add(instance)

    await db.flush()
