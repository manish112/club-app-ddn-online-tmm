-- Optional "open until" date shown to members on the Club Survey button.
-- Informational (the admin still opens/closes via status); helps set expectations.
ALTER TABLE club_surveys
  ADD COLUMN IF NOT EXISTS closes_at date;
