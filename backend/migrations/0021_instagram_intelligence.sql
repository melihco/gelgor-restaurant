-- Migration 0021: Deep Instagram brand intelligence fields
-- Stores per-post captions (for agent injection) and GPT-4o structured
-- analysis of the brand's real Instagram voice, themes, and patterns.

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS instagram_recent_captions TEXT,
  ADD COLUMN IF NOT EXISTS instagram_intelligence     JSONB;
