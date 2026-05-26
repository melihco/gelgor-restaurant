-- Migration 0012: Extended brand intelligence fields
-- Adds Tripadvisor reviews, hyper-local Instagram location posts,
-- and Google Trends data to brand_contexts table.

ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS tripadvisor_reviews        TEXT,
    ADD COLUMN IF NOT EXISTS location_posts             TEXT,
    ADD COLUMN IF NOT EXISTS google_trends              TEXT,
    ADD COLUMN IF NOT EXISTS extended_intelligence_updated_at VARCHAR(50);
