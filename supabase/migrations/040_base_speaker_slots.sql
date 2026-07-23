-- Meetings track their base (admin-configured) speaker-slot count separately
-- from the live count. Extra slots granted via requests raise speaker_slots
-- above the base; when a speaker revokes an extra slot it can be trimmed back
-- down, but never below base_speaker_slots.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS base_speaker_slots integer;

-- Backfill: treat the current count as the base (safe — nothing shrinks below it).
UPDATE meetings SET base_speaker_slots = speaker_slots WHERE base_speaker_slots IS NULL;

ALTER TABLE meetings ALTER COLUMN base_speaker_slots SET DEFAULT 1;
ALTER TABLE meetings ALTER COLUMN base_speaker_slots SET NOT NULL;
