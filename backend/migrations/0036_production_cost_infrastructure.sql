-- Migration 0036: Production cost infrastructure (SSOT for admin analytics)
--
-- cost_events          — immutable atomic charge (tenant / mission / slot / artifact)
-- mission_slot_cost_rollups — denormalized per-slot totals for feed production
-- mission_cost_rollups      — denormalized per-mission totals (graph + feed + integration)
--
-- Legacy mission_cost_ledger + artifact_cost_ledger remain for backward compatibility;
-- new writes dual-land in cost_events via production_cost_service.

CREATE TABLE IF NOT EXISTS cost_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    mission_id          UUID REFERENCES missions(id) ON DELETE SET NULL,
    artifact_id         UUID,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    usage_date          DATE NOT NULL,

    -- mission_graph | feed_slot | integration | gallery | other
    scope               VARCHAR(32) NOT NULL DEFAULT 'other',
    category            VARCHAR(64) NOT NULL,
    call_type           VARCHAR(64),

    -- Slot identity (feed production)
    slot_key            VARCHAR(96),
    idea_index          INTEGER,
    slot_role           VARCHAR(64),
    pipeline            VARCHAR(64),
    attempt             SMALLINT NOT NULL DEFAULT 0,

    -- Provider / pricing
    source_system       VARCHAR(32) NOT NULL DEFAULT 'unknown',
    source_ref          VARCHAR(128),
    provider            VARCHAR(32),
    model               VARCHAR(64),
    pricing_basis       VARCHAR(32) NOT NULL DEFAULT 'catalog_estimate',
    -- measured_tokens | provider_metered | catalog_estimate | manual

    amount_usd          NUMERIC(12, 6) NOT NULL,
    tokens_in           INTEGER,
    tokens_out          INTEGER,
    cached_tokens       INTEGER,
    external_request_id VARCHAR(128),

    idempotency_key     VARCHAR(192) UNIQUE,
    extra               JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cost_events_workspace_day
    ON cost_events (workspace_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_mission
    ON cost_events (mission_id, recorded_at DESC)
    WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_events_mission_slot
    ON cost_events (mission_id, slot_key, recorded_at DESC)
    WHERE mission_id IS NOT NULL AND slot_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_events_artifact
    ON cost_events (artifact_id, recorded_at DESC)
    WHERE artifact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_events_scope_category
    ON cost_events (workspace_id, scope, category);


CREATE TABLE IF NOT EXISTS mission_slot_cost_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    mission_id          UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    slot_key            VARCHAR(96) NOT NULL,
    idea_index          INTEGER,
    slot_role           VARCHAR(64),
    pipeline            VARCHAR(64),
    artifact_id         UUID,

    total_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,
    measured_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,
    estimated_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
    line_count          INTEGER NOT NULL DEFAULT 0,
    by_category         JSONB NOT NULL DEFAULT '{}',
    by_call_type        JSONB NOT NULL DEFAULT '{}',

    -- in_progress | completed | failed
    status              VARCHAR(24) NOT NULL DEFAULT 'in_progress',
    first_recorded_at   TIMESTAMPTZ,
    last_recorded_at    TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_mission_slot_cost_rollups_key
        UNIQUE (mission_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_mission_slot_rollups_workspace
    ON mission_slot_cost_rollups (workspace_id, mission_id);


CREATE TABLE IF NOT EXISTS mission_cost_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    mission_id          UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,

    mission_graph_usd   NUMERIC(12, 6) NOT NULL DEFAULT 0,
    feed_slot_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
    integration_usd     NUMERIC(12, 6) NOT NULL DEFAULT 0,
    gallery_usd         NUMERIC(12, 6) NOT NULL DEFAULT 0,
    other_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,
    total_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,

    measured_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,
    estimated_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
    event_count         INTEGER NOT NULL DEFAULT 0,
    slot_count          INTEGER NOT NULL DEFAULT 0,

    graph_by_category   JSONB NOT NULL DEFAULT '{}',
    feed_by_category    JSONB NOT NULL DEFAULT '{}',
    by_provider         JSONB NOT NULL DEFAULT '{}',

    first_recorded_at   TIMESTAMPTZ,
    last_recorded_at    TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_mission_cost_rollups_mission UNIQUE (mission_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_cost_rollups_workspace
    ON mission_cost_rollups (workspace_id, updated_at DESC);
