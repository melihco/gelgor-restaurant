"""Platform brand registry schemas (cross-tenant admin)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PlatformBrandOut(BaseModel):
    workspace_id: UUID
    business_name: str
    business_type: str
    sector_id: str | None = None
    location: str | None = None
    instagram_handle: str | None = None
    website_url: str | None = None
    languages: str | None = None
    brand_tone: str | None = None
    updated_at: datetime | None = None
    created_at: datetime | None = None


class PlatformBrandListOut(BaseModel):
    items: list[PlatformBrandOut] = Field(default_factory=list)
    total: int = 0
    limit: int = 100
    offset: int = 0


class SectorBrandCountOut(BaseModel):
    sector_id: str
    brand_count: int


class PlatformBootstrapRequest(BaseModel):
    """Bootstrap Python mirror for an existing or new Nexus tenant UUID."""

    workspace_id: UUID
    business_name: str
    business_type: str | None = None
    sector_id: str | None = None
    location: str | None = None
    languages: str = "tr"
    website_url: str | None = None
    instagram_handle: str | None = None
    bootstrap_slots: bool = True
    create_brand_stub: bool = True


class PlatformBootstrapOut(BaseModel):
    workspace_id: UUID
    tenant_id: UUID
    workspace_name: str
    sector_id: str | None = None
    business_type: str
    brand_created: bool = False
    brand_existed: bool = False
    slots: dict[str, Any] | None = None
    slots_error: str | None = None
