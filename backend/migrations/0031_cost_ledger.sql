-- Migration 0031: Immutable AI cost ledger (mission + feed artifact line items)
--
-- Source of truth for admin pricing analytics. workspace_usage_daily and
-- missions.performance_summary.ai_cost_breakdown remain fast rollups.

CREATE TABLE IF NOT EXISTS mission_cost_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    mission_id      UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usage_date      DATE NOT NULL,

    category        VARCHAR(64) NOT NULL,
    source_system   VARCHAR(32) NOT NULL DEFAULT 'unknown',
    source_ref      VARCHAR(128),
    provider        VARCHAR(32),
    model           VARCHAR(64),

    amount_usd      NUMERIC(10, 5) NOT NULL,
    tokens_in       INTEGER,
    tokens_out      INTEGER,
    cached_tokens   INTEGER,

    idempotency_key VARCHAR(160) UNIQUE,
    extra           JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_mission_cost_ledger_mission
    ON mission_cost_ledger (mission_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_mission_cost_ledger_workspace_day
    ON mission_cost_ledger (workspace_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_mission_cost_ledger_category
    ON mission_cost_ledger (mission_id, category);


CREATE TABLE IF NOT EXISTS artifact_cost_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    mission_id      UUID REFERENCES missions(id) ON DELETE SET NULL,
    artifact_id     UUID NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usage_date      DATE NOT NULL,

    category        VARCHAR(64) NOT NULL,
    call_type       VARCHAR(64),
    source_system   VARCHAR(32) NOT NULL DEFAULT 'unknown',
    provider        VARCHAR(32),
    model           VARCHAR(64),

    amount_usd      NUMERIC(10, 5) NOT NULL,
    slot_role       VARCHAR(64),
    idea_index      INTEGER,
    pipeline        VARCHAR(64),
    attempt         SMALLINT NOT NULL DEFAULT 0,

    idempotency_key VARCHAR(160) UNIQUE,
    extra           JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_artifact_cost_ledger_artifact
    ON artifact_cost_ledger (artifact_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_cost_ledger_mission
    ON artifact_cost_ledger (mission_id, recorded_at DESC)
    WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artifact_cost_ledger_workspace_day
    ON artifact_cost_ledger (workspace_id, usage_date DESC);
