-- Participation mode + online-only role reservation.
--
-- Members either attend online only, or can also attend in person ("hybrid").
-- An admin sets this per member; members can see it but not change it.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS participation_mode text NOT NULL DEFAULT 'online';

DO $$ BEGIN
  ALTER TABLE members
    ADD CONSTRAINT members_participation_mode_check
    CHECK (participation_mode IN ('online', 'hybrid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reservation window: while a meeting is more than `online_reservation_days_before`
-- days away, its roles can only be claimed by online-only members. Inside that
-- window the roles open to everyone. Off by default — the club turns it on from
-- Settings → Role Reservation. The no-same-role-back-to-back rotation rule is
-- enforced independently and always applies.
ALTER TABLE agenda_config
  ADD COLUMN IF NOT EXISTS online_reservation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_reservation_days_before integer NOT NULL DEFAULT 7;
