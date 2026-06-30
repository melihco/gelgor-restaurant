-- Durable Production Factory — per-slot production jobs.
--
-- Each weekly mission package targets 10 slots (3 story · 4 post · 1 carousel · 2 reel).
-- Instead of producing all slots in one blocking /api/auto-produce request, each slot
-- becomes a durable job row here. A drainer claims jobs (FOR UPDATE SKIP LOCKED),
-- produces them via the existing Next runProduction backfill path, and retries with
-- backoff until the manifest is satisfied. Survives restarts and is replica-safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS production_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  mission_id      UUID NOT NULL,
  node_key        TEXT,
  idea_index      INT  NOT NULL,
  slot_role       TEXT NOT NULL,
  format          TEXT NOT NULL,          -- post | story | reel | carousel
  pipeline        TEXT NOT NULL,
  library_slot_key TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|claimed|running|ready|failed|exhausted|skipped
  attempts        INT  NOT NULL DEFAULT 0,
  max_attempts    INT  NOT NULL DEFAULT 3,
  artifact_id     UUID,
  last_error      TEXT,
  payload         JSONB,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,
  claimed_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_production_jobs_slot UNIQUE (mission_id, idea_index, slot_role)
);

-- Claim query hits this: ready-to-run jobs ordered by schedule.
CREATE INDEX IF NOT EXISTS ix_production_jobs_claim
  ON production_jobs (status, run_after);

CREATE INDEX IF NOT EXISTS ix_production_jobs_mission
  ON production_jobs (mission_id);

COMMENT ON TABLE production_jobs IS
  'Durable per-slot mission feed production jobs (factory queue). One row per manifest slot.';
