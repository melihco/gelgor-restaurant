-- Brand Design Templates — AI-generated, brand-consistent design templates.
--
-- Generated during onboarding by Fal.ai (GPT-image grounded edit) using the
-- brand's real gallery photos, corporate colors, logo and vibe. Each workspace
-- gets a curated set (target 10) of templates covering the sector's recurring
-- needs: campaign announcements, special-day creatives, menu/venue showcases,
-- reel covers, etc.
--
-- Unlike brand_scheduled_templates (uploaded media on a schedule) and
-- brand_post_templates (operator canvas layouts), these are AI design recipes:
-- the design_spec captures the prompt, color/font directives and gallery
-- reference so production (auto-produce) can re-render brand-consistent
-- variations for any mission caption/headline.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS brand_design_templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL,

    -- Identity
    template_type     VARCHAR(48) NOT NULL,   -- campaign_announcement, event_special, menu_highlight, ...
    template_name     VARCHAR(160) NOT NULL,  -- locale-aware display name
    format            VARCHAR(24) NOT NULL DEFAULT 'story',  -- story | post | reel_cover

    -- AI-generated preview (R2-mirrored Fal.ai output)
    thumbnail_url     TEXT,

    -- Design recipe — prompt, brand colors, font directives, layout rules,
    -- gallery reference URL, sample headline, vibe directive, logo placement.
    design_spec       JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Classification
    sector_category   VARCHAR(64),  -- restaurant, beach_club, beauty_wellness, ...
    locale            VARCHAR(8),   -- special-day calendar resolution (e.g. 'tr')

    -- Lifecycle
    status            VARCHAR(24) NOT NULL DEFAULT 'active',  -- active | archived
    usage_count       INTEGER NOT NULL DEFAULT 0,
    last_used_at      TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_brand_design_templates_workspace
    ON brand_design_templates (workspace_id, status);

CREATE INDEX IF NOT EXISTS ix_brand_design_templates_type
    ON brand_design_templates (workspace_id, template_type, status);

COMMENT ON TABLE brand_design_templates IS
    'AI-generated brand-consistent design templates produced during onboarding from real gallery photos, brand colors and logo; re-used as design recipes in auto-produce.';
