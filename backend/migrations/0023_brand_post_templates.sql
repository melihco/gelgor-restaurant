-- Reusable deterministic social post templates per workspace.
-- Stores Canvas/SVG layout specs so logo placement and text regions are repeatable.

CREATE TABLE IF NOT EXISTS brand_post_templates (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name                 VARCHAR(120) NOT NULL,
    format               VARCHAR(24) NOT NULL DEFAULT 'post',
    status               VARCHAR(24) NOT NULL DEFAULT 'active',
    template_kind        VARCHAR(32) NOT NULL DEFAULT 'canvas',
    layout_spec          JSONB NOT NULL DEFAULT '{}'::jsonb,
    thumbnail_url        TEXT,
    example_artifact_url TEXT,
    usage_count          INTEGER NOT NULL DEFAULT 0,
    last_used_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_brand_post_templates_workspace_id
    ON brand_post_templates(workspace_id);

CREATE INDEX IF NOT EXISTS ix_brand_post_templates_workspace_status
    ON brand_post_templates(workspace_id, status);

COMMENT ON TABLE brand_post_templates IS
    'Reusable deterministic post/story template layouts with logo slots and typography regions.';
