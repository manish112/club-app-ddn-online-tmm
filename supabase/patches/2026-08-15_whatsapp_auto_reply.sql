-- =============================================================================
-- Add the auto-reply toggle to a database that predates the feature.
-- =============================================================================
--
-- Run this in the Supabase SQL editor BEFORE deploying the code that adds
-- automatic replies to inbound WhatsApp texts. Safe to run more than once, and
-- safe on a database that already has the column.
--
-- WHY THE ORDER MATTERS. The settings API route (app/api/admin/whatsapp-settings)
-- writes auto_reply_enabled on every save, unconditionally. Deploy the code
-- first and the very next settings save — of anything, even an unrelated
-- toggle — fails with "column does not exist" until this has run.
--
-- This is also folded into supabase/schema.sql, which is safe to run instead
-- (or afterwards; both are idempotent).
-- =============================================================================

ALTER TABLE whatsapp_settings
  ADD COLUMN IF NOT EXISTS auto_reply_enabled boolean NOT NULL DEFAULT true;

-- ── Check it worked ─────────────────────────────────────────────────────────
SELECT auto_reply_enabled FROM whatsapp_settings WHERE id = 1;
