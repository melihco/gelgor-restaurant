"""Pydantic schemas for production slot catalog API."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CanonicalSectorOut(BaseModel):
    sector_id: str
    label_tr: str
    label_en: str
    aliases: list[str] = Field(default_factory=list)
    is_active: bool = True
    sort_order: int = 0


class ProductionSlotDefinitionOut(BaseModel):
    slot_key: str
    sector_id: str
    label_tr: str
    label_en: str
    format: str
    pipeline: str
    slot_role: str
    design_template_type: str
    library_slot_key: str | None = None
    tier: str = "standard"
    match_signals: dict[str, Any] = Field(default_factory=dict)
    prompt_pack: dict[str, Any] = Field(default_factory=dict)
    optional_tags: list[str] = Field(default_factory=list)
    enabled_by_default: bool = True
    sort_order: int = 0
    status: str = "active"


class TenantSlotAssignmentOut(BaseModel):
    id: UUID
    workspace_id: UUID
    slot_key: str
    enabled: bool
    priority: int
    assignment_source: str
    notes: str | None = None
    slot: ProductionSlotDefinitionOut | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenantSlotAssignmentUpsert(BaseModel):
    slot_key: str
    enabled: bool = True
    priority: int = 100
    assignment_source: str = "operator"
    notes: str | None = None


class BulkTenantSlotAssignmentRequest(BaseModel):
    assignments: list[TenantSlotAssignmentUpsert]


class BootstrapTenantSlotsResponse(BaseModel):
    workspace_id: UUID
    sector_id: str
    created: int
    updated: int
    enabled_count: int
