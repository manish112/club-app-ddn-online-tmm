-- Speakathon extras: an admin-assigned Jury panel and named speaker groups (heats).
-- jury_slots drives the Jury section (shown when > 0); speaker_groups holds the
-- named heats and pair_groups maps each speaker slot index to a group id.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS jury_slots     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speaker_groups jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- [{ id, name }]
  ADD COLUMN IF NOT EXISTS pair_groups    jsonb   NOT NULL DEFAULT '{}'::jsonb;   -- { "<slotIndex>": "<groupId>" }

-- Allow the new 'jury' role_key. The inline check from 001_schema is auto-named
-- <table>_<column>_check, so drop-if-exists then re-add with jury included.
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_role_key_check;
ALTER TABLE role_claims ADD  CONSTRAINT role_claims_role_key_check
  CHECK (role_key IN (
    'speaker','evaluator','tmod','ttm','ge',
    'grammarian','ah_counter','timer','harkmaster','jury'
  ));
