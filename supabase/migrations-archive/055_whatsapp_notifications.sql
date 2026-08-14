-- ============================================================
-- WhatsApp notifications via the Meta (WhatsApp Cloud) API.
--
-- Deliberately a sibling of the email system (migration 041), not an extension
-- of it: the two are configured, toggled and templated independently, and a
-- club may well run one without the other.
--
-- The one thing worth knowing about the Cloud API before reading further: a
-- business-initiated message MUST use a template that Meta has approved in
-- advance. Free-form text only reaches someone who messaged the business in
-- the last 24 hours. So a "template" here is a *mapping* onto an approved Meta
-- template — its name, its language, and which of our variables fill its
-- positional {{1}}, {{2}}… body parameters — plus the body text itself, kept so
-- an admin can submit it for approval and so text mode has something to send.
-- ============================================================

-- ── Connection settings (singleton, id = 1) ────────────────────────────────
-- The access token is SECRET. Like email_settings, RLS is on with NO anon
-- policies, so only the service role (server routes) can read or write it.
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id                    integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled               boolean     NOT NULL DEFAULT false,
  access_token          text        NOT NULL DEFAULT '',   -- Meta permanent/system-user token
  phone_number_id       text        NOT NULL DEFAULT '',   -- the sender's Phone Number ID
  business_account_id   text        NOT NULL DEFAULT '',   -- WABA id (informational)
  api_version           text        NOT NULL DEFAULT 'v25.0',
  -- Members store phones in whatever shape they typed. Anything without a
  -- country code is assumed to be from here.
  default_country_code  text        NOT NULL DEFAULT '91',
  -- Send plain text instead of approved templates. Only reaches members inside
  -- the 24-hour customer-service window, so it's for testing, not production.
  text_mode             boolean     NOT NULL DEFAULT false,

  -- Per-notification toggles, mirroring email_settings.
  meeting_created_enabled   boolean NOT NULL DEFAULT true,   -- new meeting announced
  role_reminder_enabled     boolean NOT NULL DEFAULT true,   -- 1 day before, to role holders
  no_role_nudge_enabled     boolean NOT NULL DEFAULT true,   -- 1 day before, to members without a role
  meeting_starting_enabled  boolean NOT NULL DEFAULT true,   -- meeting day, shortly before it starts
  -- How long before the start time the "join us" message goes out. The cron
  -- only runs so often, so this is the window's width, not an exact lead time.
  meeting_starting_lead_minutes integer NOT NULL DEFAULT 70,

  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO whatsapp_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated clients get nothing. Service role bypasses RLS.

-- ── Template mapping (our message kind → an approved Meta template) ─────────
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  key            text        PRIMARY KEY,
  -- The name as approved in Meta Business Manager. Blank → nothing is sent for
  -- this kind (unless text_mode is on, which needs no approved template).
  template_name  text        NOT NULL DEFAULT '',
  language_code  text        NOT NULL DEFAULT 'en',
  -- The body copy, with {{placeholders}} named after our variables. Sent as-is
  -- in text mode; in template mode it's the text to submit to Meta, and the
  -- source the positional parameters are read from.
  body_text      text        NOT NULL DEFAULT '',
  -- Our variable names in the order Meta's {{1}}, {{2}}… expect them. Empty
  -- falls back to the order the placeholders appear in body_text.
  param_vars     text[]      NOT NULL DEFAULT '{}',
  enabled        boolean     NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed the known kinds as empty rows; blank body_text falls back to the
-- built-in default in lib/whatsapp/defaults.ts.
INSERT INTO whatsapp_templates (key) VALUES
  ('meeting_created'),
  ('role_reminder'),
  ('no_role_nudge'),
  ('meeting_starting')
ON CONFLICT DO NOTHING;

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- ── Send log + idempotency guard ───────────────────────────────────────────
-- Same contract as email_sends: the cron claims a dedupe_key before sending, so
-- a unique violation means "already sent" → skip. Retried or overlapping runs
-- can't double-message anyone.
CREATE TABLE IF NOT EXISTS whatsapp_sends (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key    text        UNIQUE,
  template_key  text,
  meeting_id    uuid        REFERENCES meetings(id) ON DELETE SET NULL,
  recipient     text,                                  -- E.164 digits, no '+'
  wa_message_id text,                                  -- Meta's message id, when accepted
  status        text        NOT NULL DEFAULT 'sent',   -- 'sent' | 'error'
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_sends_created_idx ON whatsapp_sends (created_at DESC);

ALTER TABLE whatsapp_sends ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- ── Per-member opt-out ─────────────────────────────────────────────────────
-- Separate from email_notifications (migration 046): someone may well want the
-- email and not the WhatsApp, or the other way round.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS whatsapp_notifications boolean NOT NULL DEFAULT true;
