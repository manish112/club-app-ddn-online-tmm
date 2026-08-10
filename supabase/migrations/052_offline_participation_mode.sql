-- Dehradun WIC India club members — a third participation mode, 'offline'.
--
-- These members belong to a different club but take part in this club's
-- meetings. They see everything the home club sees; the only difference is
-- when role sign-up opens to them: a mirror of the online reservation window
-- with its own (usually much tighter) lead time, so home-club members get
-- first pick and WIC members fill what's left near the meeting.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_participation_mode_check;
ALTER TABLE members
  ADD CONSTRAINT members_participation_mode_check
  CHECK (participation_mode IN ('online', 'hybrid', 'offline'));

-- Independent of online_reservation_enabled: the WIC gate is the whole point of
-- letting these members in, so it's on by default at 2 days before the meeting.
-- Both are edited from Settings → Role Reservation.
ALTER TABLE agenda_config
  ADD COLUMN IF NOT EXISTS offline_reservation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS offline_reservation_days_before integer NOT NULL DEFAULT 2;
