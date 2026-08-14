-- ============================================================
-- Delivery status for WhatsApp sends.
--
-- Migration 055 recorded what happened when we *posted* to Meta: accepted, or
-- rejected with an error. That is not the same thing as delivered. Meta answers
-- the POST with HTTP 200 and a message id as soon as it takes the message off
-- our hands; whether it ever reaches a phone is decided afterwards, and reported
-- only over a webhook. Everything that goes wrong in between — a number not on
-- WhatsApp, a member who blocked the sender, a marketing template Meta chose to
-- pace — is invisible without it, which is exactly the failure this adds.
--
-- Kept in separate columns rather than overwriting `status`: "Meta accepted it"
-- and "the phone received it" are two different facts, and an admin chasing a
-- missing reminder needs to know which of the two failed.
-- ============================================================

ALTER TABLE whatsapp_sends
  -- 'sent' | 'delivered' | 'read' | 'failed', verbatim from Meta. NULL means no
  -- callback has arrived yet — either the webhook isn't configured, or Meta
  -- hasn't got round to it.
  ADD COLUMN IF NOT EXISTS delivery_status text,
  -- The failure as Meta describes it, code included. This is the only place the
  -- real reason ever appears.
  ADD COLUMN IF NOT EXISTS delivery_error  text,
  ADD COLUMN IF NOT EXISTS delivery_at     timestamptz;

-- The webhook looks a row up by Meta's message id on every callback, and there
-- are three or four of those per message.
CREATE INDEX IF NOT EXISTS whatsapp_sends_wa_message_idx
  ON whatsapp_sends (wa_message_id);

-- Declared in migration 055 but missing from the deployed database, so the
-- settings panel could never store the WABA id — which is what the templates
-- endpoint is keyed on.
ALTER TABLE whatsapp_settings
  ADD COLUMN IF NOT EXISTS business_account_id text NOT NULL DEFAULT '';
