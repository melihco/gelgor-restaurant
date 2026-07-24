"""
Platform tenant/workspace bootstrap — Python mirror for Nexus tenant UUIDs.

Creates placeholder tenant + workspace, optional brand_context stub, and
optional sector slot assignments. Nexus remains SSOT for customer tenancy.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import brand_context_service, slot_catalog_service
from app.services.brand_service_profile_service import canonical_sector_from_category
from app.crew.industry_playbooks import normalize_industry_id
from app.services.workspace_service import ensure_nexus_mirror_workspace, get_workspace

logger = structlog.get_logger()


def _normalize_sector(value: str | None) -> str | None:
    raw = (value or "").strip().lower().replace(" ", "_").replace("&", "_")
    if not raw:
        return None
    via_cat = canonical_sector_from_category(raw)
    return normalize_industry_id(via_cat or raw) or None


async def bootstrap_platform_workspace(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    business_name: str,
    business_type: str | None = None,
    sector_id: str | None = None,
    location: str | None = None,
    languages: str = "tr",
    website_url: str | None = None,
    instagram_handle: str | None = None,
    bootstrap_slots: bool = True,
    create_brand_stub: bool = True,
) -> dict[str, Any]:
    """
    Idempotent bootstrap for a Nexus tenant UUID:
    1) ensure tenants + workspaces mirror rows
    2) ensure brand_context stub (optional)
    3) bootstrap tenant_slot_assignments for sector (optional)
    """
    name = (business_name or "").strip() or "Brand"
    sector = _normalize_sector(sector_id) or _normalize_sector(business_type)
    btype = (business_type or sector or "general_business").strip() or "general_business"

    ws = await ensure_nexus_mirror_workspace(db, workspace_id)
    # Refresh display name on workspace when still placeholder.
    if ws.name in ("Default workspace", "Nexus tenant") and name:
        ws.name = name
        await db.flush()

    brand_created = False
    brand_existed = False
    if create_brand_stub:
        existing = await brand_context_service.get_brand_context(db, workspace_id)
        if existing:
            brand_existed = True
            # Light enrichment — never overwrite a filled name with empty.
            if name and (
                not existing.business_name
                or existing.business_name in ("Brand", "Nexus tenant")
            ):
                existing.business_name = name
            if btype and existing.business_type in ("general_business", "", None):
                existing.business_type = btype
            if location and not existing.location:
                existing.location = location
            if website_url and not existing.website_url:
                existing.website_url = website_url
            if instagram_handle and not existing.instagram_handle:
                existing.instagram_handle = instagram_handle.lstrip("@")
            if sector:
                profile = dict(existing.brand_service_profile or {})
                if not profile.get("category"):
                    profile["category"] = sector
                    existing.brand_service_profile = profile
            await db.flush()
        else:
            ctx = await brand_context_service.ensure_brand_context(
                db,
                workspace_id,
                business_name=name,
                business_type=btype,
            )
            brand_created = True
            if location:
                ctx.location = location
            if languages:
                ctx.languages = languages
            if website_url:
                ctx.website_url = website_url
            if instagram_handle:
                ctx.instagram_handle = instagram_handle.lstrip("@")
            if sector:
                ctx.brand_service_profile = {"category": sector}
            await db.flush()

    slots_result: dict[str, Any] | None = None
    slots_error: str | None = None
    if bootstrap_slots and sector:
        try:
            slots_result = await slot_catalog_service.bootstrap_tenant_slot_assignments(
                db,
                workspace_id,
                sector_id=sector,
                assignment_source="onboarding",
            )
        except ValueError as exc:
            slots_error = str(exc)
            logger.warning(
                "platform_bootstrap_slots_failed",
                workspace_id=str(workspace_id),
                sector_id=sector,
                error=slots_error,
            )

    await db.flush()
    ws = await get_workspace(db, workspace_id)
    logger.info(
        "platform_workspace_bootstrapped",
        workspace_id=str(workspace_id),
        sector_id=sector,
        brand_created=brand_created,
        slots_ok=slots_result is not None,
    )
    return {
        "workspace_id": workspace_id,
        "tenant_id": workspace_id,  # Nexus mirror: same UUID
        "workspace_name": ws.name if ws else name,
        "sector_id": sector,
        "business_type": btype,
        "brand_created": brand_created,
        "brand_existed": brand_existed,
        "slots": slots_result,
        "slots_error": slots_error,
    }
