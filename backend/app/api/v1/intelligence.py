"""
Intelligence API — task recommendation endpoints.

GET  /{workspace_id}/recommendations   → returns 3-5 prioritised task recommendations
POST /{workspace_id}/recommendations/refresh → force regeneration (bypass cache)
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.task_recommendation_service import get_recommendations

logger = structlog.get_logger()
router = APIRouter()


@router.get("/{workspace_id}/recommendations")
async def get_task_recommendations(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns prioritised task recommendations for this workspace.
    Cached for 1 hour — fast for dashboard display.
    The CEO Intelligence Agent analyses all available tenant signals
    and produces pre-filled briefs the operator can run with one click.
    """
    try:
        result = await get_recommendations(db, workspace_id)
        return result
    except Exception as exc:
        logger.error("recommendations_api_error", workspace_id=str(workspace_id), error=str(exc))
        raise HTTPException(500, f"Could not generate recommendations: {exc}") from exc


@router.post("/{workspace_id}/recommendations/refresh")
async def refresh_task_recommendations(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Force regeneration of recommendations, bypassing the 1-hour cache."""
    try:
        result = await get_recommendations(db, workspace_id, force_refresh=True)
        return result
    except Exception as exc:
        logger.error("recommendations_refresh_error", workspace_id=str(workspace_id), error=str(exc))
        raise HTTPException(500, f"Could not refresh recommendations: {exc}") from exc
