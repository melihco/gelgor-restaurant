-- Per-tenant brand template config for Creatomate video pack
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS brand_primary_color  VARCHAR(16)  DEFAULT '#1a1a2e',
    ADD COLUMN IF NOT EXISTS brand_accent_color   VARCHAR(16)  DEFAULT '#e8c97a',
    ADD COLUMN IF NOT EXISTS brand_font_family    VARCHAR(64)  DEFAULT 'Montserrat',
    ADD COLUMN IF NOT EXISTS brand_overlay_opacity DECIMAL(3,2) DEFAULT 0.55;
