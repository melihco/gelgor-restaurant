"""API routes for the special-days reference calendar.

Read-only: returns the special days relevant to a country (or a workspace's
resolved country) + sector, sorted by proximity. Drives the onboarding design
template engine and is also queryable directly by the frontend.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.brand_context import BrandContext
from app.schemas.special_days import SpecialDayRead, SpecialDaysResponse
from app.services.special_day_service import (
    get_special_days,
    resolve_country_code,
)

logger = structlog.get_logger()

router = APIRouter()


def _to_read(day) -> SpecialDayRead:
    return SpecialDayRead(
        name=day.name,
        name_en=day.name_en,
        category=day.category,
        theme_hint=day.theme_hint,
        month=day.month,
        day=day.day,
        mmdd=day.mmdd,
        importance=day.importance,
        days_until=day.days_until,
        country_code=day.country_code,
    )


@router.get("", response_model=SpecialDaysResponse)
async def list_special_days(
    country: str = Query("TR", description="ISO-3166 alpha-2 country code"),
    sector: str = Query("", description="Canonical sector for relevance filtering"),
    within_days: int | None = Query(None, ge=0, le=366),
    limit: int | None = Query(None, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List upcoming special days for an explicit country + sector."""
    cc = resolve_country_code(country_code=country)
    days = await get_special_days(
        db, country_code=cc, sector=sector, within_days=within_days, limit=limit,
    )
    return SpecialDaysResponse(
        country_code=cc,
        sector=sector,
        days=[_to_read(d) for d in days],
    )


@router.get("/workspace/{workspace_id}", response_model=SpecialDaysResponse)
async def list_workspace_special_days(
    workspace_id: uuid.UUID,
    within_days: int | None = Query(None, ge=0, le=366),
    limit: int | None = Query(None, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List upcoming special days for a workspace (country resolved from brand)."""
    result = await db.execute(
        select(BrandContext).where(BrandContext.workspace_id == workspace_id)
    )
    ctx = result.scalar_one_or_none()
    if ctx is None:
        raise HTTPException(status_code=404, detail="Brand context not found")

    cc = resolve_country_code(
        country_code=getattr(ctx, "country_code", None),
        location=ctx.location,
        languages=ctx.languages,
    )
    sector = (ctx.business_type or "").strip()
    days = await get_special_days(
        db, country_code=cc, sector=sector, within_days=within_days, limit=limit,
    )
    return SpecialDaysResponse(
        country_code=cc,
        sector=sector,
        days=[_to_read(d) for d in days],
    )
