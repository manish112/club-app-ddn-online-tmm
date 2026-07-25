-- Configurable public app URL used in email links (Open the app, Join meeting,
-- Review request, etc.). Falls back to NEXT_PUBLIC_APP_URL / a hard default when
-- left blank.
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS app_url text NOT NULL DEFAULT '';
