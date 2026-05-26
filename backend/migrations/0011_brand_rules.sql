-- Migration 0011: Brand Rules table
--
-- Stores auto-promoted rules derived from the tenant approval history.
-- The learning promoter (weekly scheduler) scans confirmed patterns and creates
-- BrandRule rows with status='under_review' when promotion thresholds are met.
-- Operators approve or reject them via the Brand Hub.
-- Approved rules are applied to BrandContext.content_pillars / default_ctas /
-- custom_rules / risk_rules so future agent prompts reflect lived experience.
--
-- Rule types:
--   content_pillar    → content format confirmed as preferred (→ content_pillars)
--   cta               → CTA in 5+ approved pieces              (→ default_ctas)
--   hook_pattern      → caption hook type that works           (→ custom_rules note)
--   format_preference → suggestion_type with ≥80% approval    (→ content_pillars)
--   format_avoidance  → suggestion_type with ≤30% approval    (→ risk_rules)

CREATE TABLE IF NOT EXISTS brand_rules (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Rule identity
    -- Type: content_pillar | cta | hook_pattern | format_preference | format_avoidance
    rule_type           VARCHAR(50)  NOT NULL,
    -- The value being proposed (e.g. "Rezervasyon Yap" or "daily_story")
    rule_key            VARCHAR(200) NOT NULL,
    -- Human-readable description for the operator review UI
    rule_value          TEXT,

    -- Evidence strength
    confirmation_count  INTEGER      NOT NULL DEFAULT 0,
    approval_rate       FLOAT,                          -- NULL for count-based rules (CTA)
    confidence          FLOAT        NOT NULL DEFAULT 0.7,
    evidence_summary    TEXT,

    -- Lifecycle: under_review → active | rejected; active → deprecated
    status              VARCHAR(30)  NOT NULL DEFAULT 'under_review',

    -- Provenance: learning | manual | brand_discovery
    source              VARCHAR(30)  NOT NULL DEFAULT 'learning',

    -- Timestamps
    promoted_at         TIMESTAMPTZ,
    promoted_by         VARCHAR(255),
    rejected_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Workspace + status filter — used by the Brand Hub pending rules view
CREATE INDEX IF NOT EXISTS ix_brand_rules_workspace_status
    ON brand_rules (workspace_id, status);

-- Unique constraint: one rule per (workspace, type, key, source) combination.
-- Prevents the promoter from creating duplicate proposals for the same pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_rules_workspace_type_key
    ON brand_rules (workspace_id, rule_type, rule_key)
    WHERE status != 'rejected';

-- Note: updated_at is maintained by SQLAlchemy onupdate=func.now() at the ORM layer.
