-- Sprint 2 (S2.9) — Gallery matcher-average instrumentation.
-- Stores a rolling log of recent caption↔photo match scores so the
-- Gallery Intelligence Score (GIS) can evaluate the "matcher avg ≥58" check.
-- JSON shape: { "scores": [number, ...], "updatedAt": "ISO8601" }  (last ~40 kept)

ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS gallery_match_stats TEXT;
