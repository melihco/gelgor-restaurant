ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS creatomate_template_id VARCHAR(128);
