-- Social media OAuth connections table
CREATE TABLE IF NOT EXISTS social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    platform VARCHAR(32) NOT NULL,
    ig_user_id VARCHAR(64),
    ig_username VARCHAR(128),
    page_id VARCHAR(64),
    page_name VARCHAR(255),
    access_token TEXT,
    token_type VARCHAR(32),
    token_expires_at TIMESTAMPTZ,
    followers_count INTEGER,
    media_count INTEGER,
    cached_insights TEXT,
    insights_updated_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_social_connections_workspace_id ON social_connections(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_social_connections_workspace_platform
    ON social_connections(workspace_id, platform) WHERE is_active = TRUE;
