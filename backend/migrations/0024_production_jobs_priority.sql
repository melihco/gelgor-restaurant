-- Priority lanes for production jobs.
-- Higher priority → drained first. 0 = normal (organic), 10 = urgent (premium tenant).
-- COALESCE(priority, 0) in claim_batch ORDER BY handles existing NULL rows.

ALTER TABLE production_jobs
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;

-- Rebuild claim index to include priority for efficient ordering.
DROP INDEX IF EXISTS ix_production_jobs_claim;
CREATE INDEX ix_production_jobs_claim
  ON production_jobs (status, priority DESC, run_after ASC);
