-- Migration 0020: Performance indexes for frequently-filtered queries.
--
-- Run: psql "$DATABASE_URL" -f backend/migrations/0020_performance_indexes.sql
--
-- These indexes cover the query patterns that appear on every dashboard load:
--   • missions  filtered by workspace_id + status (MissionHub, AIActivity)
--   • mission_task_nodes filtered by mission_id + status (task graph executor)
--   • suggestions filtered by workspace_id + status (tenant learning)
--   • artifacts filtered by workspace_id + created_at (feed, outputs)
--   • brand_contexts lookup by workspace_id (already has index via FK; add covering)

-- ── missions ─────────────────────────────────────────────────────────────────
-- Most common pattern: WHERE workspace_id = $1 AND status IN ('proposed','in_flight')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_missions_ws_status
    ON missions (workspace_id, status);

-- Dashboard time-sorted list: WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT N
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_missions_ws_created
    ON missions (workspace_id, created_at DESC);

-- ── mission_task_nodes ───────────────────────────────────────────────────────
-- TaskGraphExecutor: WHERE mission_id = $1 AND status = 'pending'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_nodes_mission_status
    ON mission_task_nodes (mission_id, status);

-- ── suggestions (tenant learning) ────────────────────────────────────────────
-- TenantLearningService: WHERE workspace_id = $1 AND status IN ('approved','rejected')
--   ORDER BY approved_at DESC LIMIT N
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suggestions_ws_status_date
    ON suggestions (workspace_id, status, approved_at DESC NULLS LAST);

-- ── output_artifacts ─────────────────────────────────────────────────────────
-- Feed/outputs: WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT N
-- (table may be named differently — use the actual table name if this fails)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'output_artifacts') THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_output_artifacts_ws_created
                 ON output_artifacts (workspace_id, created_at DESC)';
    END IF;
END$$;

-- ── brand_contexts ───────────────────────────────────────────────────────────
-- Already has FK index; add partial index for confirmed brands (used in scheduler scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brand_ctx_ws_confirmed
    ON brand_contexts (workspace_id)
    WHERE brand_constitution_confirmed_at IS NOT NULL;
