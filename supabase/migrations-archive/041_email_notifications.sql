-- ============================================================
-- Email notification system: configurable SMTP connection,
-- editable templates, and idempotent send log. Plus a per-meeting
-- video-conference link.
-- ============================================================

-- ── Connection settings (singleton, id = 1) ────────────────────────────────
-- SMTP credentials are SECRET. Unlike agenda_config (world-readable via public
-- RLS), this table has RLS enabled with NO anon policies, so only the service
-- role key (used by server routes) can read or write it.
CREATE TABLE IF NOT EXISTS email_settings (
  id                 integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled            boolean     NOT NULL DEFAULT false,
  smtp_host          text        NOT NULL DEFAULT '',
  smtp_port          integer     NOT NULL DEFAULT 587,
  smtp_secure        boolean     NOT NULL DEFAULT false,   -- true for port 465 (implicit TLS)
  smtp_user          text        NOT NULL DEFAULT '',
  smtp_pass          text        NOT NULL DEFAULT '',
  from_name          text        NOT NULL DEFAULT 'Dehradun Online Toastmasters',
  from_email         text        NOT NULL DEFAULT '',
  reply_to           text        NOT NULL DEFAULT '',
  day_before_enabled boolean     NOT NULL DEFAULT true,    -- 1-day-before per-role reminders
  hour_before_enabled boolean    NOT NULL DEFAULT true,    -- 1-hour-before mass meeting reminder
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO email_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated clients get nothing. Service role bypasses RLS.

-- ── Editable templates (subject + HTML body with {{placeholders}}) ──────────
-- Not secret, but only ever read server-side, so also service-role only.
CREATE TABLE IF NOT EXISTS email_templates (
  key         text        PRIMARY KEY,
  subject     text        NOT NULL DEFAULT '',
  body_html   text        NOT NULL DEFAULT '',
  enabled     boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the known template keys as empty rows; empty subject/body falls back to
-- the built-in defaults in lib/email/defaults.ts. Admins can override per key.
INSERT INTO email_templates (key) VALUES
  ('meeting_created'),
  ('role_assigned'),
  ('role_removed'),
  ('role_reminder'),
  ('meeting_reminder'),
  ('evaluator_request')
ON CONFLICT DO NOTHING;

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- ── Send log + idempotency guard for reminders ─────────────────────────────
-- The reminder cron INSERTs a dedupe_key before sending; a unique violation
-- means "already sent" → skip. Makes overlapping/retried cron runs safe.
CREATE TABLE IF NOT EXISTS email_sends (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key      text        UNIQUE,
  template_key    text,
  meeting_id      uuid        REFERENCES meetings(id) ON DELETE SET NULL,
  recipient_count integer     NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'sent',   -- 'sent' | 'error'
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- ── Per-meeting video link (Zoom/Meet URL) ─────────────────────────────────
-- Settable by the meeting's TMoD or an admin; meetings already allow anon
-- writes (see 001_schema.sql), so the client can update it directly.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_link text;
