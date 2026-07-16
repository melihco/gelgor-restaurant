-- Faz 5 — production_jobs catalog slot binding.
--
-- Persists the tenant catalog slot key (production_slot_definitions.slot_key)
-- chosen at plan time onto each durable job row. Read by mission job summaries
-- and Mission Hub so slot cards can show the brand's catalog label + template.
-- Dual-read: rows without slot_key keep working (legacy matcher path).

ALTER TABLE production_jobs
    ADD COLUMN IF NOT EXISTS slot_key VARCHAR(128);

CREATE INDEX IF NOT EXISTS ix_production_jobs_slot_key
    ON production_jobs (mission_id, slot_key)
    WHERE slot_key IS NOT NULL;

COMMENT ON COLUMN production_jobs.slot_key IS
    'Tenant catalog slot (production_slot_definitions.slot_key) bound at plan time — Faz 5.';
