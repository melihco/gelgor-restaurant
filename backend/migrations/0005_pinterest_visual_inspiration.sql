-- Pinterest visual inspiration fields
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS visual_inspiration      TEXT,
    ADD COLUMN IF NOT EXISTS visual_inspiration_updated_at VARCHAR(50);
