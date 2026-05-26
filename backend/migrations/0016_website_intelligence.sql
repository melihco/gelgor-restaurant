-- Website intelligence (menu catalog, venue/product photos) + gallery_analysis safety
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS website_intelligence JSONB;

ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS gallery_analysis TEXT;
