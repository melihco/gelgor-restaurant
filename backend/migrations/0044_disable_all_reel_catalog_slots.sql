-- Pause reel production catalog-wide: brands keep post/story/carousel;
-- reel definitions stay in catalog but are off by default and unassigned.
-- Re-enable later via tenant_slot_assignments.enabled / enabled_by_default.

UPDATE production_slot_definitions
SET enabled_by_default = false
WHERE format = 'reel'
  AND enabled_by_default IS DISTINCT FROM false;

UPDATE tenant_slot_assignments AS a
SET
  enabled = false,
  notes = CASE
    WHEN a.notes IS NULL OR btrim(a.notes) = '' THEN 'disabled_reel_pause_2026_08'
    WHEN a.notes LIKE '%disabled_reel_pause_2026_08%' THEN a.notes
    ELSE a.notes || ' | disabled_reel_pause_2026_08'
  END
FROM production_slot_definitions AS d
WHERE a.slot_key = d.slot_key
  AND d.format = 'reel'
  AND a.enabled IS DISTINCT FROM false;
