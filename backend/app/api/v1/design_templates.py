"""API routes for brand design templates (AI-generated brand-consistent designs)."""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.design_templates import (
    DesignTemplateBulkUpsert,
    DesignTemplateCreate,
    DesignTemplateRead,
    DesignTemplateUpdate,
)
from app.services.design_template_service import (
    bulk_upsert_templates,
    create_template,
    delete_template,
    get_template,
    list_templates,
    update_template,
)

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{workspace_id}", response_model=list[DesignTemplateRead])
async def list_workspace_templates(
    workspace_id: uuid.UUID,
    include_archived: bool = False,
    template_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List design templates for a workspace."""
    return await list_templates(
        db,
        workspace_id,
        include_archived=include_archived,
        template_type=template_type,
    )


@router.post("/{workspace_id}", response_model=DesignTemplateRead, status_code=201)
async def create_workspace_template(
    workspace_id: uuid.UUID,
    body: DesignTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a single design template."""
    try:
        template = await create_template(db, workspace_id, body)
        await db.commit()
        return template
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{workspace_id}/bulk", response_model=list[DesignTemplateRead], status_code=201)
async def bulk_upsert_workspace_templates(
    workspace_id: uuid.UUID,
    body: DesignTemplateBulkUpsert,
    db: AsyncSession = Depends(get_db),
):
    """Replace the active design-template set for a workspace (onboarding batch)."""
    templates = await bulk_upsert_templates(db, workspace_id, body)
    await db.commit()
    return templates


@router.get("/{workspace_id}/{template_id}", response_model=DesignTemplateRead)
async def get_workspace_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single design template."""
    template = await get_template(db, workspace_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/{workspace_id}/{template_id}", response_model=DesignTemplateRead)
async def update_workspace_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    body: DesignTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a design template (or increment its usage counter)."""
    template = await update_template(db, workspace_id, template_id, body)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.commit()
    return template


@router.delete("/{workspace_id}/{template_id}", status_code=204)
async def delete_workspace_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a design template."""
    deleted = await delete_template(db, workspace_id, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.commit()
