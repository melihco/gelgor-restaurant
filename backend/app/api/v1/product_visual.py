"""
Product Visual Studio — API routes for product photo scene direction.

POST /api/v1/product-visual/scene-brief
  Runs the ProductSceneDirectorAgent (CrewAI) to generate a detailed
  visual scene brief for GPT image-2 product photo enhancement.
  Called by the Next.js /api/enhance-product-photo route (internal).
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import verify_internal_api_key, get_db
from app.crew.context import BrandInfo
from app.crew.crews.product_scene_crew import run_product_scene_director
from app.services.brand_context_service import build_brand_info
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()
router = APIRouter()


class SceneBriefRequest(BaseModel):
    workspace_id: uuid.UUID
    caption: str = Field(default="", max_length=1000)
    product_type: str = Field(default="", max_length=200)
    enhance_level: str = Field(default="moderate", pattern="^(subtle|moderate|full)$")
    sector: str = Field(default="", max_length=100)
    mood: str = Field(default="", max_length=100)
    visual_subject: str = Field(
        default="product_hero",
        pattern="^(venue_ambiance|product_hero)$",
    )


@router.post(
    "/scene-brief",
    dependencies=[Depends(verify_internal_api_key)],
    summary="Generate product photo scene brief via AI",
)
async def generate_scene_brief(
    body: SceneBriefRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Runs the Product Scene Director CrewAI agent to create a precise
    visual scene brief for GPT image-2 product photo enhancement.

    Used internally by the Next.js enhance-product-photo route.
    """
    brand: BrandInfo | None = await build_brand_info(db, body.workspace_id)
    if not brand:
        logger.warning("product_visual.brand_not_found", workspace_id=str(body.workspace_id))
        raise HTTPException(status_code=404, detail="Brand context not found for workspace")

    logger.info(
        "product_visual.scene_brief_start",
        workspace_id=str(body.workspace_id),
        brand=brand.business_name,  # type: ignore[union-attr]
        enhance_level=body.enhance_level,
        sector=body.sector or brand.business_type,
    )

    scene_brief = run_product_scene_director(
        brand=brand,  # type: ignore[arg-type]
        caption=body.caption,
        product_type=body.product_type,
        enhance_level=body.enhance_level,
        sector=body.sector,
        mood=body.mood,
        visual_subject=body.visual_subject,
    )

    return {"ok": True, "scene_brief": scene_brief}
