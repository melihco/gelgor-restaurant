-- Production Slot Catalog — global sector/slot definitions + per-tenant assignments.
--
-- Sector IDs align with apps/web/src/lib/sector-production-profile.ts (normalizeSectorId).
-- Tenant sector resolves via brand_contexts.brand_service_profile.category → canonical_sectors.
--
-- Production pipeline integration is deferred (Faz 5); this migration is catalog + assignment only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Canonical sectors (reference catalog) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS canonical_sectors (
    sector_id     VARCHAR(64) PRIMARY KEY,
    label_tr      VARCHAR(120) NOT NULL,
    label_en      VARCHAR(120) NOT NULL,
    aliases       JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE canonical_sectors IS
    'Canonical sector slugs — must match sector-production-profile.ts sectorId and normalizeSectorId() output.';

-- ── Global production slot definitions (sector × content need × format) ─────

CREATE TABLE IF NOT EXISTS production_slot_definitions (
    slot_key              VARCHAR(128) PRIMARY KEY,
    sector_id             VARCHAR(64) NOT NULL REFERENCES canonical_sectors(sector_id) ON DELETE RESTRICT,
    label_tr              VARCHAR(160) NOT NULL,
    label_en              VARCHAR(160) NOT NULL,
    format                VARCHAR(24) NOT NULL,   -- post | story | reel | carousel
    pipeline              VARCHAR(48) NOT NULL,  -- fal_design | fal_reel | fal_story | gallery_photo | carousel_gallery
    slot_role             VARCHAR(64) NOT NULL,  -- factory bridge: fal_designed_post, organic_post, ...
    design_template_type  VARCHAR(48) NOT NULL,  -- Fal gallery bridge: campaign_announcement, venue_showcase, ...
    library_slot_key      VARCHAR(48),           -- 7-key bridge: event_story, campaign_post, ...
    tier                  VARCHAR(24) NOT NULL DEFAULT 'standard',  -- standard | premium
    match_signals         JSONB NOT NULL DEFAULT '{}'::jsonb,
    prompt_pack           JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled_by_default    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    status                VARCHAR(24) NOT NULL DEFAULT 'active',  -- active | archived
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_sector
    ON production_slot_definitions (sector_id, status, sort_order);

CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_format
    ON production_slot_definitions (format, status);

COMMENT ON TABLE production_slot_definitions IS
    'Global slot catalog — content need + format per sector. Links to Fal design_template_type for brand template gallery.';

-- ── Per-tenant slot assignments (operator overrides + onboarding defaults) ───

CREATE TABLE IF NOT EXISTS tenant_slot_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL,
    slot_key            VARCHAR(128) NOT NULL REFERENCES production_slot_definitions(slot_key) ON DELETE CASCADE,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    priority            INTEGER NOT NULL DEFAULT 100,
    assignment_source   VARCHAR(32) NOT NULL DEFAULT 'auto_default',  -- auto_default | operator | onboarding
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_slot_assignments_workspace_slot UNIQUE (workspace_id, slot_key)
);

CREATE INDEX IF NOT EXISTS ix_tenant_slot_assignments_workspace
    ON tenant_slot_assignments (workspace_id, enabled, priority);

COMMENT ON TABLE tenant_slot_assignments IS
    'Per-brand enabled slots. Operator panel can override sector defaults. Bootstrap copies enabled_by_default rows.';

-- Link brand_design_templates to catalog slot (optional, set during onboarding generation)
ALTER TABLE brand_design_templates
    ADD COLUMN IF NOT EXISTS catalog_slot_key VARCHAR(128);

CREATE INDEX IF NOT EXISTS ix_brand_design_templates_catalog_slot
    ON brand_design_templates (workspace_id, catalog_slot_key)
    WHERE catalog_slot_key IS NOT NULL;

COMMENT ON COLUMN brand_design_templates.catalog_slot_key IS
    'Optional FK to production_slot_definitions.slot_key — ties Fal preview to catalog slot.';
