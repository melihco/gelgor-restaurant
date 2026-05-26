-- Migration 0002: Meta Ad Account support
-- Adds ad_account_id to social_connections and creates meta_ad_campaigns table

ALTER TABLE social_connections
    ADD COLUMN IF NOT EXISTS ad_account_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS ad_account_name VARCHAR(255);

CREATE TABLE IF NOT EXISTS meta_ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    artifact_id VARCHAR(64),
    campaign_id VARCHAR(64) NOT NULL,
    adset_id VARCHAR(64),
    ad_id VARCHAR(64),
    ad_creative_id VARCHAR(64),
    objective VARCHAR(64),
    budget_tl DECIMAL(10,2),
    duration_days INT,
    status VARCHAR(32) DEFAULT 'PAUSED',
    estimated_reach INT,
    actual_reach INT,
    spend_tl DECIMAL(10,2) DEFAULT 0,
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_campaigns_workspace
    ON meta_ad_campaigns(workspace_id);
