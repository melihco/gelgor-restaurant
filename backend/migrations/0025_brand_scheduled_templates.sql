-- Brand Scheduled Templates — recurring story/reel gallery items.
--
-- Each brand can have up to 10 templates. Each template has:
-- - Multiple media files (uploaded by user, no AI processing)
-- - A repeating schedule (which days, what time, optional end time)
-- - Format: story or reel
-- - Status: active/paused/archived
--
-- The feed engine checks active templates and shows them when their schedule window
-- is open, hides them when the window closes, and re-shows them next scheduled time.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS brand_scheduled_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  slot_index      INT  NOT NULL CHECK (slot_index BETWEEN 1 AND 10),
  
  -- Identity
  name            TEXT NOT NULL,            -- e.g. "Good Morning", "Happy Hour"
  description     TEXT,
  format          TEXT NOT NULL DEFAULT 'story',  -- story | reel
  
  -- Media (JSON array of media objects)
  -- Each: { url, key, type: 'image'|'video', thumbnail_url?, duration_ms?, uploaded_at }
  media_items     JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Schedule configuration
  -- schedule_type: 'daily' | 'specific_days'
  schedule_type   TEXT NOT NULL DEFAULT 'daily',
  -- For specific_days: which days (0=Mon, 6=Sun)
  schedule_days   JSONB DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
  -- Start time (HH:MM in brand's local timezone)
  schedule_time   TEXT NOT NULL DEFAULT '10:00',
  -- Optional end time — if set, template is hidden after this time
  -- If NULL, stays visible for 24h from schedule_time
  schedule_end_time TEXT,
  -- Timezone for schedule resolution
  timezone        TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  
  -- Status
  status          TEXT NOT NULL DEFAULT 'active',  -- active | paused | archived
  
  -- Sector-specific categorization
  category        TEXT,  -- e.g. 'morning_greeting', 'happy_hour', 'menu_special', 'event_promo'
  
  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_brand_scheduled_template_slot UNIQUE (workspace_id, slot_index)
);

CREATE INDEX IF NOT EXISTS ix_brand_scheduled_templates_workspace
  ON brand_scheduled_templates (workspace_id, status);

CREATE INDEX IF NOT EXISTS ix_brand_scheduled_templates_active
  ON brand_scheduled_templates (status, schedule_type)
  WHERE status = 'active';

COMMENT ON TABLE brand_scheduled_templates IS
  'Recurring story/reel templates — user-uploaded media published on a schedule without AI modification.';
