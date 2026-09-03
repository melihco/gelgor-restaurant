-- Persist analysis extras that used to be thrown away after onboarding
-- (template_needs, asset_recommendations, missing_questions, competitor IG).
-- Safe to run multiple times.

BEGIN;

ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS discovery_outputs JSONB;

COMMIT;
