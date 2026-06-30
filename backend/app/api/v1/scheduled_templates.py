"""API routes for brand scheduled templates."""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.scheduled_templates import (
    ScheduledTemplateCreate,
    ScheduledTemplateUpdate,
    ScheduledTemplateRead,
    ScheduledTemplateFeedItem,
)
from app.services.scheduled_template_service import (
    list_templates,
    get_template,
    create_template,
    update_template,
    delete_template,
    resolve_active_templates_for_feed,
)

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{workspace_id}", response_model=list[ScheduledTemplateRead])
async def list_workspace_templates(
    workspace_id: uuid.UUID,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """List all scheduled templates for a workspace."""
    templates = await list_templates(db, workspace_id, include_archived=include_archived)
    return templates


@router.post("/{workspace_id}", response_model=ScheduledTemplateRead, status_code=201)
async def create_workspace_template(
    workspace_id: uuid.UUID,
    body: ScheduledTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new scheduled template (max 10 per workspace)."""
    try:
        template = await create_template(db, workspace_id, body)
        await db.commit()
        return template
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{workspace_id}/feed/active", response_model=list[ScheduledTemplateFeedItem])
async def get_active_feed_templates(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get templates that are currently active (within their schedule window)."""
    templates = await list_templates(db, workspace_id)
    return resolve_active_templates_for_feed(templates)


@router.get("/{workspace_id}/{template_id}", response_model=ScheduledTemplateRead)
async def get_workspace_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single scheduled template."""
    template = await get_template(db, workspace_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/{workspace_id}/{template_id}", response_model=ScheduledTemplateRead)
async def update_workspace_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    body: ScheduledTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a scheduled template's configuration or media."""
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
    """Permanently delete a scheduled template."""
    deleted = await delete_template(db, workspace_id, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.commit()
