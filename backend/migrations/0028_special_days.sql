-- Special Days — global reference calendar of recurring annual occasions.
--
-- Country-scoped + international (shared) special days that brands post about
-- every year: Valentine's, Mother's/Father's Day, national holidays, plus
-- sector-relevant world days. International rows use country_code = 'INT' and
-- apply to every brand; country rows (e.g. 'TR') add nation-specific holidays.
--
-- Used during onboarding to pre-generate brand-consistent `event_special`
-- design templates for the brand's country, and by the special-day mission
-- scheduler to auto-propose a campaign ~7 days ahead of each occasion.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS special_days (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 'INT' = international/shared (all countries), else ISO-3166 alpha-2 ('TR', 'US', ...)
    country_code      VARCHAR(8) NOT NULL,

    -- Fixed Gregorian date. Movable feasts use an approximate annual date.
    month             SMALLINT NOT NULL,
    day               SMALLINT NOT NULL,

    name              VARCHAR(160) NOT NULL,        -- localized display name
    name_en           VARCHAR(160),                 -- english reference name

    category          VARCHAR(32) NOT NULL,         -- romantic|celebration|family|national|religious|seasonal|sector
    theme_hint        TEXT NOT NULL,                -- creative prompt seed for the design template

    -- Canonical sectors this day is especially relevant for (empty = all sectors).
    sectors           JSONB NOT NULL DEFAULT '[]'::jsonb,

    importance        SMALLINT NOT NULL DEFAULT 3,  -- 1..5, higher = stronger commercial relevance
    is_international   BOOLEAN NOT NULL DEFAULT false,
    active            BOOLEAN NOT NULL DEFAULT true,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_special_days_country
    ON special_days (country_code, active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_special_days_entry
    ON special_days (country_code, month, day, name);

COMMENT ON TABLE special_days IS
    'Global reference calendar of recurring annual special days, country-scoped plus international shared rows; drives onboarding event templates and special-day mission automation.';

-- Brand country code — resolved from location/languages during onboarding,
-- selects the brand's national special-day calendar (INT rows always apply).
ALTER TABLE brand_contexts
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(8);
