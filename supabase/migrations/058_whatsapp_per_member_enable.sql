-- ============================================================
-- Per-member WhatsApp permission, decided by an admin.
--
-- Every WhatsApp message Meta delivers costs the club money, and until now the
-- only per-member control was `whatsapp_notifications` (migration 055) — the
-- member's OWN opt-out, which a member can flip back on from their profile at
-- any time. That is the right shape for a preference and the wrong shape for a
-- budget: the club could not decide who it is willing to pay to message.
--
-- So the two facts are separated:
--
--   whatsapp_enabled        admin-controlled. "Is the club willing to send
--                           WhatsApp to this member at all?" Off for anyone
--                           newly added, so a new member never costs anything
--                           until an admin says so, and NOT changeable by the
--                           member — a profile switch cannot buy club credit.
--
--   whatsapp_notifications  the member's own choice, and only meaningful while
--                           the admin gate above is open. A member can always
--                           mute; they cannot un-mute what the club never
--                           turned on.
--
-- A message goes out only when both are true, which is enforced server-side in
-- lib/whatsapp/notifications.ts (`waMemberSkipReason`) rather than in the UI —
-- the members table is writable by the anon client, so the send path is the only
-- place a rule like this can actually hold.
-- ============================================================

-- Added nullable, backfilled, then given its default and NOT NULL — rather than
-- `ADD COLUMN ... NOT NULL DEFAULT false` followed by an UPDATE, which on a
-- re-run would re-enable every member an admin had since switched off. This way
-- the backfill only ever touches rows that have never had a value.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean;

-- Existing members keep exactly the reach they have today: anyone currently
-- receiving WhatsApp carries on, and anyone already opted out stays off. The new
-- default is off, so this migration changes nothing about who is being messaged
-- right now — it only takes the decision away from new members and hands it to
-- an admin.
UPDATE members
   SET whatsapp_enabled = (whatsapp_notifications IS NOT FALSE)
 WHERE whatsapp_enabled IS NULL;

ALTER TABLE members ALTER COLUMN whatsapp_enabled SET DEFAULT false;
ALTER TABLE members ALTER COLUMN whatsapp_enabled SET NOT NULL;
