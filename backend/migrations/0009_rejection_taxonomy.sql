-- Migration 0009: Structured rejection taxonomy
--
-- Adds rejection_code to the approvals table so that rejection signals from
-- human reviewers are stored as a structured enum value rather than (or in
-- addition to) a free-text reviewer_note.
--
-- This feeds directly into tenant_learning_service._extract_rejection_patterns(),
-- which builds the "NEVER produce content that…" directive injected into every
-- content-agent prompt.  A structured code lets the service emit precise,
-- category-labeled directives instead of falling back to content-length inference.
--
-- Valid values mirror RejectionReason in tenant_learning_service.py:
--   tone_mismatch | too_generic | visual_off_brand | brand_safety_violation
--   competitor_overlap | factual_error | cultural_insensitivity | duplicate_concept
--   wrong_cta | wrong_format | caption_too_long | caption_too_short
--   wrong_hashtags | operator_preference | other
--
-- NULL means no structured code was supplied (old rows, or approval decisions).

ALTER TABLE approvals
    ADD COLUMN IF NOT EXISTS rejection_code VARCHAR(50);

-- Partial index: only index rows that actually have a code, keeping the
-- index small.  Used by analytics queries filtering on specific rejection types.
CREATE INDEX IF NOT EXISTS ix_approvals_rejection_code
    ON approvals (rejection_code)
    WHERE rejection_code IS NOT NULL;

-- Convenience view: rejection summary per workspace and code, useful for
-- future analytics dashboards and the brand-rules promotion pipeline.
CREATE OR REPLACE VIEW rejection_code_summary AS
SELECT
    s.workspace_id,
    a.rejection_code,
    COUNT(*)                                    AS rejection_count,
    MAX(a.reviewed_at)                          AS last_seen_at
FROM approvals a
JOIN suggestions s ON s.id = a.suggestion_id
WHERE a.decision = 'rejected'
  AND a.rejection_code IS NOT NULL
GROUP BY s.workspace_id, a.rejection_code;
