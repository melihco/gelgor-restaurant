-- Brand Service Profile — validated, mission-critical brand positioning.
--
-- The flat `business_type` string is brittle (e.g. a Bodrum beach-club bar was
-- misclassified as "local_products_shop", which then drove the wrong template
-- kit, content pillars, CTA style and gallery affinity). This column stores a
-- structured, operator/LLM-validated profile that the mission engine reads as
-- the authoritative positioning, decoupled from the brittle classifier:
--
--   {
--     "category": "beach_club_bar",
--     "category_confidence": 0.0-1.0,
--     "signature_offerings": ["imza kokteyller", "rosé şarap", "deniz aktiviteleri"],
--     "cta_style": "reservation|ecommerce|booking|visit|contact",
--     "primary_ctas": ["Rezervasyon Yap", "Masanı Ayır"],
--     "seasonality": "year_round|summer|winter|seasonal",
--     "value_props": ["deniz kenarı", "gün batımı atmosferi"],
--     "content_guardrails": ["çocuk/aile-merkezli içerik üretme"],
--     "source": "onboarding_llm|heuristic|operator",
--     "version": 1
--   }

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS brand_service_profile JSONB;

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS brand_service_profile_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN brand_contexts.brand_service_profile IS
  'Validated mission-critical brand positioning (category, offerings, CTA style, seasonality, guardrails). Authoritative over business_type for mission production.';
