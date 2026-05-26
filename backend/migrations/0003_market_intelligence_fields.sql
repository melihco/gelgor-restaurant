-- Market Intelligence Agent fields
-- Adds competitor_pulse, market_opportunity_ideas, market_intelligence_updated_at
-- to brand_contexts table.

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS competitor_pulse TEXT,
  ADD COLUMN IF NOT EXISTS market_opportunity_ideas TEXT,
  ADD COLUMN IF NOT EXISTS market_intelligence_updated_at VARCHAR(50);
