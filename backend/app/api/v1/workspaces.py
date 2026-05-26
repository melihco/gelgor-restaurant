from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_tenant_id
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate
from app.services import workspace_service

router = APIRouter()


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    return await workspace_service.list_workspaces(db, tenant_id)


@router.get("/{workspace_id}", response_model=WorkspaceRead)
async def get_workspace(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.get_workspace(db, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    return ws


@router.post("", response_model=WorkspaceRead, status_code=201)
async def create_workspace(
    data: WorkspaceCreate,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    return await workspace_service.create_workspace(db, tenant_id, data)


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
async def update_workspace(
    workspace_id: uuid.UUID,
    data: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.update_workspace(db, workspace_id, data)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    return ws
