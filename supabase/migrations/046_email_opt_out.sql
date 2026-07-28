-- Per-member email opt-out. Default true (opted in); a member can uncheck
-- "Send me email notifications" on their profile to stop receiving emails.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true;
