-- Migration 0001: Brand Context Discovery Fields
-- Date: 2025-05-07
-- Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).
--
-- Apply with:
--   psql $DATABASE_URL -f backend/migrations/0001_brand_context_discovery_fields.sql
--
-- In development the app auto-creates tables from scratch (no existing table = no migration needed).
-- Run this migration ONLY when upgrading an existing database that already has brand_contexts.

BEGIN;

-- Discovery source URLs
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(100);
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS google_business_url TEXT;

-- Discovery output (JSON strings)
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS content_pillars TEXT;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS default_ctas TEXT;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS risk_rules TEXT;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS instagram_top_hashtags TEXT;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS website_summary TEXT;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS instagram_bio TEXT;

-- Discovery metadata
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS discovery_confidence INTEGER;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS last_brand_analysis_at TIMESTAMPTZ;
ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS brand_constitution_confirmed_at TIMESTAMPTZ;

-- Widen pre-existing String(100) columns to Text so inferred values are not truncated.
-- These are safe no-ops in PostgreSQL (Text is already a supertype of varchar).
ALTER TABLE brand_contexts ALTER COLUMN brand_tone TYPE TEXT;
ALTER TABLE brand_contexts ALTER COLUMN visual_style TYPE TEXT;

COMMIT;
