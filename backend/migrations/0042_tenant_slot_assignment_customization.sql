-- Brand-scoped creative brief overlay for production slots.
-- Sector catalog stays global; per-tenant design intent lives on assignments.

ALTER TABLE tenant_slot_assignments
    ADD COLUMN IF NOT EXISTS customization JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenant_slot_assignments.customization IS
    'Brand×slot overlay: creative_intent_tr, must_show, must_avoid, daypart, mood, seed_source. Merged into prompt_pack at resolve time for template library / production.';
