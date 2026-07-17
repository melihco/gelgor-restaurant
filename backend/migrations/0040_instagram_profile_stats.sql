-- Migration 0040: Live Instagram profile stats for mobile profile UI
-- Captured from Apify (or public IG scrape) during brand discovery.
-- Separate from logo_url (production brand mark) — profile avatar is IG pic.

ALTER TABLE brand_contexts
  ADD COLUMN IF NOT EXISTS instagram_profile_pic_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_followers INTEGER,
  ADD COLUMN IF NOT EXISTS instagram_following INTEGER,
  ADD COLUMN IF NOT EXISTS instagram_posts_count INTEGER;
