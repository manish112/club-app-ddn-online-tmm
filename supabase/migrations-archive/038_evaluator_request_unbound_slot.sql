-- An evaluator request can originate from an extra-speaker-slot request, before
-- the speaker's slot exists. Allow the paired slot to be unbound (NULL) until the
-- extra slot is approved, and link the request back to the originating
-- speaker-slot request so it can be bound/cancelled alongside it.
--
-- (Postgres treats NULLs as distinct in a UNIQUE constraint, so the existing
-- UNIQUE (meeting_id, speaker_slot_index) still permits several unbound rows.)

ALTER TABLE evaluator_requests ALTER COLUMN speaker_slot_index DROP NOT NULL;

ALTER TABLE evaluator_requests
  ADD COLUMN IF NOT EXISTS speaker_slot_request_id UUID REFERENCES speaker_slot_requests(id) ON DELETE CASCADE;
