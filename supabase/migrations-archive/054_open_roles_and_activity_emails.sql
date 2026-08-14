-- Two new emails: the weekly open-roles invitation, and the on-demand member
-- activity report.
--
-- ── Open-roles invitation ──────────────────────────────────────────────────
-- Sent by the existing daily /api/notify-reminders cron to all members, listing
-- only the roles nobody has claimed for an upcoming meeting. Sends nothing when
-- the agenda is already full.
--
-- It goes only to members who haven't claimed anything at that meeting — someone
-- already on the agenda gets their own role reminder instead.
--
-- The timing is a set of lead times in days before the meeting, rather than
-- fixed weekdays, so it tracks the club's schedule: 2 days before a Saturday
-- meeting is Thursday, and a meeting moved to another day takes its invitations
-- along. Several days can be chosen — e.g. ARRAY[4,2] nudges on Tuesday and
-- again on Thursday, each send reaching whoever is still without a role.
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS open_roles_enabled     boolean   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_roles_days_before integer[] NOT NULL DEFAULT ARRAY[2];

-- An earlier draft of this migration created open_roles_days_before as a single
-- integer. ADD COLUMN IF NOT EXISTS silently skips an existing column whatever
-- its type, so convert it here — otherwise a database that ran that draft keeps
-- a scalar and the settings page can't read it as a list.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_settings'
      AND column_name = 'open_roles_days_before'
      AND data_type <> 'ARRAY'
  ) THEN
    ALTER TABLE email_settings ALTER COLUMN open_roles_days_before DROP DEFAULT;
    ALTER TABLE email_settings
      ALTER COLUMN open_roles_days_before TYPE integer[]
      USING ARRAY[open_roles_days_before];
    ALTER TABLE email_settings
      ALTER COLUMN open_roles_days_before SET DEFAULT ARRAY[2];
  END IF;
END $$;

-- ── Template rows ──────────────────────────────────────────────────────────
-- The activity pair is on-demand: an officer sends a member their own record of
-- roles played, for a single month or since they joined, either one at a time or
-- to the whole club. Not scheduled — it goes out only when an admin asks, from
-- the Email tab.
--
-- 'activity_encouragement' is the counterpart for a member with nothing on
-- record in that period: a warm invitation to pick a role, listing what's open
-- at the next meeting, rather than an empty table or no email at all.
--
-- Empty subject/body falls back to the built-in defaults in
-- lib/email/defaults.ts; these rows just give admins something to override.
INSERT INTO email_templates (key) VALUES
  ('open_roles'),
  ('activity_report'),
  ('activity_encouragement')
ON CONFLICT DO NOTHING;
