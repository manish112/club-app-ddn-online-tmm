-- Admin-controlled upper cap on the number of prepared-speaker slots a meeting
-- can grow to via "request extra speaker slot". Default 2.
ALTER TABLE agenda_config
  ADD COLUMN IF NOT EXISTS max_speaker_slots integer NOT NULL DEFAULT 2;

-- Every meeting now defaults to a single speaker slot; extra slots are opt-in
-- (member request → admin approval), capped by agenda_config.max_speaker_slots.
ALTER TABLE meetings
  ALTER COLUMN speaker_slots SET DEFAULT 1;
