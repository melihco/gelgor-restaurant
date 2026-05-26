-- Brand Vibe Profile — agency-grade reference DNA extracted from external accounts.
-- Stores palette / typography / motion / grading / audio / composition / caption_voice
-- + reference_frames (mirrored to R2). Driven by /api/extract-vibe BFF route.

ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS brand_vibe_profile JSONB,
    ADD COLUMN IF NOT EXISTS brand_vibe_profile_updated_at TIMESTAMPTZ;
