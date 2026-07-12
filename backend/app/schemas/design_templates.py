"""Schemas for brand design templates (AI-generated brand-consistent designs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class DesignTemplateCreate(BaseModel):
    template_type: str = Field(max_length=48)
    template_name: str = Field(max_length=160)
    format: Literal["story", "post", "reel_cover"] = "story"
    thumbnail_url: str | None = None
    design_spec: dict[str, Any] = Field(default_factory=dict)
    sector_category: str | None = None
    locale: str | None = None
    catalog_slot_key: str | None = Field(default=None, max_length=128)


class DesignTemplateUpdate(BaseModel):
    template_name: str | None = None
    format: Literal["story", "post", "reel_cover"] | None = None
    thumbnail_url: str | None = None
    design_spec: dict[str, Any] | None = None
    sector_category: str | None = None
    locale: str | None = None
    status: Literal["active", "archived"] | None = None
    increment_usage: bool = False


class DesignTemplateRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    template_type: str
    template_name: str
    format: str
    thumbnail_url: str | None
    design_spec: dict[str, Any]
    sector_category: str | None
    locale: str | None
    catalog_slot_key: str | None = None
    status: str
    usage_count: int
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DesignTemplateBulkUpsert(BaseModel):
    """Replace the active design-template set for a workspace in one call.

    Used by the onboarding generation flow: a fresh batch of templates replaces
    any prior auto-generated set (existing actives are archived first).
    """

    templates: list[DesignTemplateCreate]
    archive_existing: bool = True
