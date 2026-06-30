-- Brand Instagram chatbot / agent identity profile (per workspace)
-- Used by Mertcafe DM bot setup and future voice/agent call flows.

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS chatbot_profile JSONB,
  ADD COLUMN IF NOT EXISTS chatbot_profile_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN brand_contexts.chatbot_profile IS
  'Structured chatbot + agent identity: menu, hours, FAQs, conversation rules, agent_context_markdown';
