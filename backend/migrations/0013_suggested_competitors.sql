-- Migration 0013: AI-suggested competitors
-- Stores Perplexity-discovered competitor suggestions separately from
-- confirmed competitors so users can review and accept/reject them.

ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS suggested_competitors TEXT;
