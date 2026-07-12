-- Optional facility tags on production slot definitions (pool, dj_stage, spa, etc.)
-- Brands without a facility can disable matching slots via brand_theme.slot_facilities.

ALTER TABLE production_slot_definitions
    ADD COLUMN IF NOT EXISTS optional_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN production_slot_definitions.optional_tags IS
    'Facility requirements e.g. ["requires:pool"] — bootstrap disables when brand slot_facilities denies.';

CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_optional_tags
    ON production_slot_definitions USING gin (optional_tags);
