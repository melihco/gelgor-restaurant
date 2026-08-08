-- Migration 0043: Production line telemetry (lifecycle + timing)
--
-- production_slot_events — append-only lifecycle log per factory job
-- production_jobs timing columns — denormalized last-run wait/duration for Hub
--
-- Cost remains in cost_events (0036). This table is for "what is the line doing,
-- how long did it take, success/fail" — joined to cost_events for money.

ALTER TABLE production_jobs
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS queue_wait_ms INTEGER;

CREATE TABLE IF NOT EXISTS production_slot_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL,
    mission_id      UUID NOT NULL,
    idea_index      INTEGER,
    slot_role       TEXT,
    slot_key        VARCHAR(128),
    format          TEXT,
    pipeline        TEXT,
    -- queued | claimed | running | ready | failed | exhausted | deferred | skipped
    event_type      VARCHAR(32) NOT NULL,
    status          VARCHAR(32),
    attempt         INTEGER,
    queue_wait_ms   INTEGER,
    duration_ms     INTEGER,
    provider        VARCHAR(64),
    model           VARCHAR(96),
    artifact_id     UUID,
    error_code      VARCHAR(96),
    error_message   TEXT,
    source_system   VARCHAR(32) NOT NULL DEFAULT 'factory',
    worker_id       TEXT,
    meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_slot_events_mission_time
    ON production_slot_events (mission_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_slot_events_workspace_time
    ON production_slot_events (workspace_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_slot_events_job_time
    ON production_slot_events (job_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_slot_events_workspace_type
    ON production_slot_events (workspace_id, event_type, recorded_at DESC);

COMMENT ON TABLE production_slot_events IS
  'Append-only production-line lifecycle events (queue wait, duration, status). Cost stays in cost_events.';
