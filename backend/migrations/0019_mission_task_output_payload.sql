-- Migration 0019: parsed mission node payload
--
-- Adds a structured JSONB shadow for output_summary so the UI and production
-- pipeline can read validated agent output without reparsing raw text each time.

ALTER TABLE mission_task_nodes
    ADD COLUMN IF NOT EXISTS output_payload JSONB;

CREATE INDEX IF NOT EXISTS ix_mission_task_nodes_output_payload_gin
    ON mission_task_nodes
    USING GIN (output_payload);
