-- Reference image URLs discovered during brand analysis (JSON array of strings).
-- Safe to run multiple times.

BEGIN;

ALTER TABLE brand_contexts ADD COLUMN IF NOT EXISTS reference_image_urls TEXT;

COMMIT;
