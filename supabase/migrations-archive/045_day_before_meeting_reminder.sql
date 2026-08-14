-- Toggle for the 1-day-before "meeting reminder" mass email (separate from the
-- 1-hour-before mass reminder and the per-role reminders).
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS day_before_meeting_enabled boolean NOT NULL DEFAULT true;
