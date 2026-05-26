-- Migration 0017: BrandTheme derived token set
-- Stores the derived BrandTheme JSON for each tenant.
-- Source: derive_brand_theme() from brand_theme_service.py

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS brand_theme       JSONB,
  ADD COLUMN IF NOT EXISTS brand_theme_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN brand_contexts.brand_theme IS
  'Derived design token set (palette, typography, grading, layout) '
  'produced by brand_theme_service.derive_brand_theme(). '
  'Source waterfall: vibe_profile > visual_dna > manual_colors > sector_default.';
