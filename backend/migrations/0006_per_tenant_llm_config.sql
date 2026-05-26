-- Per-tenant LLM override: each tenant can use a different model/provider.
-- NULL = use global smart routing (default behaviour, no change for existing tenants).
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS llm_provider VARCHAR(32),
    ADD COLUMN IF NOT EXISTS llm_model    VARCHAR(128);
