"""Pydantic schemas for production slot catalog API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
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
    """NULL = sector-global; set = brand-private custom slot."""
    owner_workspace_id: UUID | None = None


class CanonicalSectorCreate(BaseModel):
    sector_id: str
    label_tr: str
    label_en: str
    aliases: list[str] = Field(default_factory=list)
    is_active: bool = True
    sort_order: int = 0


class CanonicalSectorUpdate(BaseModel):
    label_tr: str | None = None
    label_en: str | None = None
    aliases: list[str] | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class ProductionSlotDefinitionCreate(BaseModel):
    """Create a sector-global or brand-private catalog slot."""

    sector_id: str
    """Explicit key, or omit and pass suffix to auto-compose."""
    slot_key: str | None = None
    """Suffix after sector_id_ — e.g. brunch_social_post → restaurant_cafe_brunch_social_post."""
    suffix: str | None = None
    label_tr: str
    label_en: str
    format: Literal["post", "story", "reel", "carousel"]
    pipeline: str | None = None
    slot_role: str | None = None
    design_template_type: str | None = None
    library_slot_key: str | None = None
    tier: Literal["standard", "premium"] = "standard"
    match_signals: dict[str, Any] = Field(default_factory=dict)
    prompt_pack: dict[str, Any] = Field(default_factory=dict)
    optional_tags: list[str] = Field(default_factory=list)
    enabled_by_default: bool = True
    sort_order: int = 0
    status: Literal["active", "archived"] = "active"
    """When set, slot is private to this brand and auto-assigned (unless assign_to_owner=false)."""
    owner_workspace_id: UUID | None = None
    assign_to_owner: bool = True
    priority: int = 50
    notes: str | None = None


class ProductionSlotDefinitionUpdate(BaseModel):
    label_tr: str | None = None
    label_en: str | None = None
    format: Literal["post", "story", "reel", "carousel"] | None = None
    pipeline: str | None = None
    slot_role: str | None = None
    design_template_type: str | None = None
    library_slot_key: str | None = None
    tier: Literal["standard", "premium"] | None = None
    match_signals: dict[str, Any] | None = None
    prompt_pack: dict[str, Any] | None = None
    optional_tags: list[str] | None = None
    enabled_by_default: bool | None = None
    sort_order: int | None = None
    status: Literal["active", "archived"] | None = None


class ProductionSlotCloneRequest(BaseModel):
    """Clone an existing slot under a new key (optionally brand-private)."""

    suffix: str | None = None
    slot_key: str | None = None
    sector_id: str | None = None
    label_tr: str | None = None
    label_en: str | None = None
    format: Literal["post", "story", "reel", "carousel"] | None = None
    pipeline: str | None = None
    slot_role: str | None = None
    design_template_type: str | None = None
    library_slot_key: str | None = None
    tier: Literal["standard", "premium"] | None = None
    match_signals: dict[str, Any] | None = None
    prompt_pack: dict[str, Any] | None = None
    optional_tags: list[str] | None = None
    enabled_by_default: bool | None = None
    sort_order: int | None = None
    owner_workspace_id: UUID | None = None
    assign_to_owner: bool = True
    priority: int = 50
    notes: str | None = None


class SlotStatusRequest(BaseModel):
    status: Literal["active", "archived"]


class BrandCustomSlotCreate(BaseModel):
    """Convenience: create a brand-private slot for a tenant (sector from workspace)."""

    suffix: str
    label_tr: str
    label_en: str
    format: Literal["post", "story", "reel", "carousel"]
    pipeline: str | None = None
    slot_role: str | None = None
    design_template_type: str | None = None
    library_slot_key: str | None = None
    tier: Literal["standard", "premium"] = "standard"
    match_signals: dict[str, Any] = Field(default_factory=dict)
    prompt_pack: dict[str, Any] = Field(default_factory=dict)
    optional_tags: list[str] = Field(default_factory=list)
    sort_order: int = 0
    priority: int = 50
    notes: str | None = None
    sector_id: str | None = None


class TenantSlotAssignmentOut(BaseModel):
    id: UUID
    workspace_id: UUID
    slot_key: str
    enabled: bool
    priority: int
    assignment_source: str
    notes: str | None = None
    customization: dict[str, Any] = Field(default_factory=dict)
    slot: ProductionSlotDefinitionOut | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenantSlotAssignmentUpsert(BaseModel):
    slot_key: str
    enabled: bool = True
    priority: int = 100
    assignment_source: str = "operator"
    notes: str | None = None
    # Brand×slot creative brief overlay; omit to leave existing customization unchanged.
    customization: dict[str, Any] | None = None


class BulkTenantSlotAssignmentRequest(BaseModel):
    assignments: list[TenantSlotAssignmentUpsert]


class BootstrapTenantSlotsResponse(BaseModel):
    workspace_id: UUID
    sector_id: str
    created: int
    updated: int
    enabled_count: int


class SyncSlotCatalogSeedResponse(BaseModel):
    sectors_touched: int
    slots_touched: int
    total_definitions: int


class LibraryShelfOut(BaseModel):
    """Fixed 7-shelf legend — code SSOT, not tenant-mutable."""

    key: str
    label_tr: str
    label_en: str
    format: str
    sort_order: int


class FacilityOptionOut(BaseModel):
    key: str
    enabled: bool
    label_tr: str
    hint_tr: str
    # True for service-surface facilities that default OFF (hiring, events_calendar).
    opt_in: bool = False


class BrandSlotFacilitiesOut(BaseModel):
    workspace_id: UUID
    sector_id: str | None = None
    facilities: dict[str, bool]
    options: list[FacilityOptionOut]
    defaults: dict[str, bool]


class BrandSlotFacilitiesUpdateRequest(BaseModel):
    """Partial facility patch (opt-out model). Unknown keys rejected."""

    facilities: dict[str, bool] = Field(default_factory=dict)
    """When true, soft-disable tenant assignments blocked by the new facilities."""
    sync_assignments: bool = False


class BrandSlotFacilitiesUpdateResponse(BaseModel):
    workspace_id: UUID
    sector_id: str | None = None
    facilities: dict[str, bool]
    options: list[FacilityOptionOut]
    synced_disabled: int = 0
    coverage_ok: bool = True
    coverage_errors: list[str] = Field(default_factory=list)


class ShelfSummaryOut(BaseModel):
    key: str
    label_tr: str
    label_en: str
    format: str
    sort_order: int
    catalog_count: int = 0
    assigned_count: int = 0
    assignment_enabled_count: int = 0
    effective_count: int = 0
    facility_blocked_count: int = 0


class TenantSlotEffectiveOut(BaseModel):
    slot_key: str
    slot: ProductionSlotDefinitionOut
    assigned: bool
    assignment_enabled: bool | None = None
    assignment_source: str | None = None
    priority: int | None = None
    facility_blocked: bool = False
    required_facilities: list[str] = Field(default_factory=list)
    """Matches production resolver: assignment.enabled when rows exist; else sector default ∩ facilities."""
    effective_enabled: bool
    blocked_by: Literal["assignment", "facility", "not_default", "inactive"] | None = None


class CoverageOut(BaseModel):
    effective_enabled_count: int
    has_post: bool
    has_story: bool
    ok: bool
    errors: list[str] = Field(default_factory=list)


class TenantSlotAdminOverviewOut(BaseModel):
    workspace_id: UUID
    sector_id: str | None
    facilities: dict[str, bool]
    facility_options: list[FacilityOptionOut]
    shelves: list[ShelfSummaryOut]
    slots: list[TenantSlotEffectiveOut]
    coverage: CoverageOut
    assignment_row_count: int
    using_sector_defaults: bool


class TenantSlotPreviewRequest(BaseModel):
    """Dry-run proposed facilities and/or assignments. Does not persist."""

    facilities: dict[str, bool] | None = None
    assignments: list[TenantSlotAssignmentUpsert] | None = None


class TenantSlotPreviewOut(BaseModel):
    workspace_id: UUID
    sector_id: str | None
    facilities: dict[str, bool]
    shelves: list[ShelfSummaryOut]
    slots: list[TenantSlotEffectiveOut]
    coverage: CoverageOut
    would_enable: list[str] = Field(default_factory=list)
    would_disable_by_assignment: list[str] = Field(default_factory=list)
    would_disable_by_facility: list[str] = Field(default_factory=list)
    recommended_disable_by_facility: list[str] = Field(default_factory=list)
    using_sector_defaults: bool


class ResetTenantSlotsRequest(BaseModel):
    sector_id: str | None = None
    reset_facilities: bool = True
    reset_assignments: bool = True
    """When true, override operator-sourced assignment rows."""
    force_operator: bool = True


class ResetTenantSlotsResponse(BaseModel):
    workspace_id: UUID
    sector_id: str
    facilities_reset: bool
    created: int = 0
    updated: int = 0
    disabled: int = 0
    enabled_count: int = 0
    facilities: dict[str, bool] = Field(default_factory=dict)


class SyncFacilitiesToAssignmentsResponse(BaseModel):
    workspace_id: UUID
    sector_id: str | None
    disabled: int
    disabled_slot_keys: list[str] = Field(default_factory=list)
    coverage: CoverageOut


class SectorShelfCoverageOut(BaseModel):
    key: str
    label_tr: str
    label_en: str
    format: str
    sort_order: int
    active_count: int = 0


class SectorCoverageOut(BaseModel):
    """Admin sector management — slot mix + brand count for one sector."""

    sector_id: str
    label_tr: str
    label_en: str
    is_active: bool
    total_slots: int
    active_slots: int
    archived_slots: int
    enabled_by_default_count: int
    by_format: dict[str, int] = Field(default_factory=dict)
    by_design_template_type: dict[str, int] = Field(default_factory=dict)
    shelves: list[SectorShelfCoverageOut] = Field(default_factory=list)
    brand_count: int = 0


class SectorReadinessItemOut(BaseModel):
    """One pack sector’s production-readiness row for admin dashboards."""

    sector_id: str
    label_tr: str
    label_en: str
    aliases: list[str] = Field(default_factory=list)
    pack_slot_count: int
    db_active_global_slots: int
    db_total_slots: int = 0
    formats: dict[str, int] = Field(default_factory=dict)
    has_production_profile: bool
    has_industry_playbook: bool
    playbook_id: str
    seeded_in_db: bool
    db_sector_active: bool = False
    status: Literal["full", "seed_stale", "partial", "missing_pack"]
    ready: bool
    min_pack_slots: int = 12


class SectorReadinessReportOut(BaseModel):
    """Gate: pack ≥12 + profile + playbook + DB seed for all pack sectors."""

    target_full_sectors: int
    full_count: int
    ready: bool
    expected_pack_sectors: int
    expected_pack_slots: int
    db_sector_count: int
    db_active_global_slots: int
    seed_ok: bool
    sectors: list[SectorReadinessItemOut] = Field(default_factory=list)


class TenantSectorResolveOut(BaseModel):
    """Resolved canonical pack sector for a workspace (admin)."""

    workspace_id: UUID
    sector_id: str | None = None
    business_type: str | None = None
    service_profile_category: str | None = None
    source: Literal["service_profile", "business_type", "unresolved"] = "unresolved"
    facilities: dict[str, bool] = Field(default_factory=dict)
    photography_surface: bool = False
