-- Migration 0015: Per-workspace daily API usage / cost tracking
--
-- Persists estimated USD spend by day for budget caps and weekly reporting.

CREATE TABLE IF NOT EXISTS workspace_usage_daily (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    usage_date      DATE NOT NULL,
    cost_usd        NUMERIC(10, 4) NOT NULL DEFAULT 0,
    artifact_count  INTEGER NOT NULL DEFAULT 0,
    mission_count   INTEGER NOT NULL DEFAULT 0,
    breakdown       JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_workspace_usage_daily_ws_date UNIQUE (workspace_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_daily_ws_date
    ON workspace_usage_daily (workspace_id, usage_date DESC);
