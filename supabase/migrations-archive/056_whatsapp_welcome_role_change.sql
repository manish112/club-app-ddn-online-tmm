-- ============================================================
-- Three more WhatsApp messages: the welcome that introduces the channel, and
-- the pair that fire the moment a role is taken on or given up.
--
-- The welcome exists because a club can't just start messaging people's phones.
-- It says what will arrive, promises restraint, and points at the opt-out — so
-- every later nudge is one the member agreed to receive.
-- ============================================================

ALTER TABLE whatsapp_settings
  -- Sent when a member is added, and sendable to the whole club once, to
  -- introduce the channel to members who predate it.
  ADD COLUMN IF NOT EXISTS welcome_enabled     boolean NOT NULL DEFAULT true,
  -- One toggle for both directions: a club that wants to be told about role
  -- changes wants both halves, and being told only of removals would be odd.
  ADD COLUMN IF NOT EXISTS role_change_enabled boolean NOT NULL DEFAULT true;

INSERT INTO whatsapp_templates (key) VALUES
  ('welcome'),
  ('role_assigned'),
  ('role_removed')
ON CONFLICT DO NOTHING;

-- ── Graph API version ──────────────────────────────────────────────────────
-- Migration 055 shipped with v21.0 and has since been corrected to v25.0, which
-- only helps a database created after the change. Bump the column default and
-- any row still carrying the old value — but leave anything else alone, so a
-- version an admin pinned deliberately survives.
ALTER TABLE whatsapp_settings ALTER COLUMN api_version SET DEFAULT 'v25.0';

UPDATE whatsapp_settings SET api_version = 'v25.0' WHERE api_version = 'v21.0';

-- ── Drop the WhatsApp business account ID ──────────────────────────────────
-- It was recorded for reference and nothing ever read it: sending needs only
-- the token, the phone number ID and the version, which are the three pieces of
-- Meta's send URL. An always-empty field on a settings screen reads as
-- something the admin forgot to fill in, so it goes.
ALTER TABLE whatsapp_settings DROP COLUMN IF EXISTS business_account_id;
