-- Migration 0010: Mission orchestration data model
--
-- Creates the foundation for the Strategic Layer:
--   missions             — time-bound multi-agent operations
--   mission_task_nodes   — individual executable nodes in the task graph
--
-- Also extends brand_contexts with two new fields:
--   last_known_phase     — for phase-change detection (Task 3)
--   active_mission_id    — current in-flight mission for the workspace

-- ── missions ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS missions (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Identity
    title                TEXT        NOT NULL,
    -- seasonal | opportunity | competitive | recovery | manual
    type                 VARCHAR(50) NOT NULL,

    -- Intelligence provenance
    trigger_signal       VARCHAR(200),
    trigger_evidence     TEXT,

    -- Strategic intent
    objective            TEXT,
    timeline_days        INTEGER,
    creative_brief       TEXT,

    -- Task graph metadata (phase groupings — display only)
    -- [{index, name, description, node_keys: [str]}]
    phases               JSONB,
    assigned_agent_roles TEXT[],

    -- Priority & confidence
    -- critical | high | medium | low
    priority             VARCHAR(20)  NOT NULL DEFAULT 'high',
    confidence           FLOAT        NOT NULL DEFAULT 0.8,

    -- Status lifecycle
    -- proposed → approved → in_flight → completed
    --                      ↘ rejected
    --           → cancelled
    status               VARCHAR(30)  NOT NULL DEFAULT 'proposed',

    -- Status transition timestamps
    approved_at          TIMESTAMPTZ,
    approved_by          VARCHAR(255),
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    rejected_at          TIMESTAMPTZ,
    rejected_reason      TEXT,

    -- Post-completion analytics (filled after mission completes)
    performance_summary  JSONB,

    -- Standard timestamps
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status filter — used by the TaskGraphExecutor and Mission Hub
CREATE INDEX IF NOT EXISTS ix_missions_workspace_status
    ON missions (workspace_id, status);

-- Proposed missions feed — ordered by confidence descending
CREATE INDEX IF NOT EXISTS ix_missions_workspace_proposed
    ON missions (workspace_id, confidence DESC)
    WHERE status = 'proposed';


-- ── mission_task_nodes ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mission_task_nodes (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id           UUID        NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    workspace_id         UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Short human-readable key, unique within a mission.
    -- Used in depends_on arrays so StrategistAgent graphs stay readable.
    -- e.g. "content_strategy", "post_ideation", "reel_calendar"
    node_key             VARCHAR(100) NOT NULL,
    phase_index          INTEGER      NOT NULL DEFAULT 0,
    title                VARCHAR(500) NOT NULL,

    -- Execution routing
    task_type            VARCHAR(100) NOT NULL,
    agent_role           VARCHAR(100) NOT NULL,

    -- Input forwarded to engine.execute() — executor merges creative_brief before call
    input_data           JSONB,
    -- Per-node brief override; NULL = use mission.creative_brief
    brief_override       TEXT,

    -- Dependency graph — node_key strings of nodes that must complete first
    depends_on           TEXT[],

    -- Status: pending | running | completed | failed | skipped
    status               VARCHAR(30)  NOT NULL DEFAULT 'pending',

    -- Output
    output_artifact_id   VARCHAR(36),
    output_summary       TEXT,

    -- Execution tracking
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    error_message        TEXT,
    retry_count          INTEGER      NOT NULL DEFAULT 0,

    -- Standard timestamps
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- node_key must be unique within a mission
    CONSTRAINT uq_mission_task_node_key UNIQUE (mission_id, node_key)
);

-- Primary executor query: "give me all pending nodes for this mission"
CREATE INDEX IF NOT EXISTS ix_mission_task_nodes_mission_status
    ON mission_task_nodes (mission_id, status);

-- Cross-workspace status view for the scheduler job
CREATE INDEX IF NOT EXISTS ix_mission_task_nodes_workspace_status
    ON mission_task_nodes (workspace_id, status);


-- ── brand_contexts additions ──────────────────────────────────────────────────

-- Tracks the industry calendar phase name seen on the last scheduler run.
-- The phase-change detector (Task 3) compares current vs this value.
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS last_known_phase VARCHAR(200);

-- UUID string of the currently in-flight mission (NULL = idle).
-- Stored as VARCHAR to avoid a cross-schema FK; enforced in application code.
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS active_mission_id VARCHAR(36);


-- Note: updated_at is kept current by SQLAlchemy's onupdate=func.now()
-- at the ORM layer. No DB-level trigger needed.
