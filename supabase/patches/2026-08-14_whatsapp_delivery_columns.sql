-- =============================================================================
-- Add the WhatsApp delivery-status columns to a database that never got them.
-- =============================================================================
--
-- Run this in the Supabase SQL editor. Safe to run more than once, and safe on a
-- database that already has the columns — every statement is IF NOT EXISTS.
--
-- WHY IT IS NEEDED. The delivery webhook (/api/whatsapp-webhook) looks a send up
-- by Meta's message id and records what happened to it:
--
--   select id, wa_message_id, delivery_status from whatsapp_sends where ...
--
-- Without these columns that select fails with 42703, the handler finds no rows
-- to update, and Meta is still answered 200 — so callbacks keep arriving and
-- nothing is recorded anywhere. The message log then shows every message
-- permanently as "Accepted — no delivery confirmation yet", which looks exactly
-- like a webhook that was never configured.
--
-- This is the content of migration 057, and also a subset of
-- supabase/schema.sql — running that whole file instead does this and brings
-- everything else up to date too, at the cost of also normalizing meeting_link.
-- =============================================================================

ALTER TABLE whatsapp_sends
  -- 'sent' | 'delivered' | 'read' | 'failed', verbatim from Meta. NULL means no
  -- callback has arrived yet, which is a different fact from "not delivered".
  ADD COLUMN IF NOT EXISTS delivery_status text,
  -- The failure as Meta describes it, code included. The only place the real
  -- reason a message never arrived ever appears.
  ADD COLUMN IF NOT EXISTS delivery_error  text,
  ADD COLUMN IF NOT EXISTS delivery_at     timestamptz;

-- The webhook looks a row up by Meta's message id on every callback, and there
-- are three or four of those per message.
CREATE INDEX IF NOT EXISTS whatsapp_sends_wa_message_idx
  ON whatsapp_sends (wa_message_id);

-- ── Check it worked ─────────────────────────────────────────────────────────
-- Expect three rows: delivery_at, delivery_error, delivery_status.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'whatsapp_sends'
   AND column_name LIKE 'delivery%'
 ORDER BY column_name;
