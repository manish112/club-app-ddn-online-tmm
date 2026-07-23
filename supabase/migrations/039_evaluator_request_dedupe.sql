-- A speaker should have at most one *pending* evaluator nomination per meeting.
-- Unbound (extra-slot) rows use a NULL slot, so the old per-slot UNIQUE couldn't
-- prevent duplicates. Collapse any existing duplicates (keep the newest), replace
-- the per-slot uniqueness with a per-speaker "one pending" rule.

UPDATE evaluator_requests e SET status = 'cancelled'
WHERE status = 'pending'
  AND EXISTS (
    SELECT 1 FROM evaluator_requests e2
    WHERE e2.meeting_id = e.meeting_id
      AND e2.speaker_id = e.speaker_id
      AND e2.status = 'pending'
      AND (e2.created_at > e.created_at OR (e2.created_at = e.created_at AND e2.id > e.id))
  );

-- The paired evaluator slot is derived from the speaker (one speaker → one slot),
-- and dedupe below guarantees at most one pending per speaker, so per-slot
-- uniqueness (which also blocked reusing a slot after a cancelled row) is dropped.
ALTER TABLE evaluator_requests DROP CONSTRAINT IF EXISTS evaluator_requests_meeting_id_speaker_slot_index_key;

CREATE UNIQUE INDEX IF NOT EXISTS evaluator_requests_one_pending_per_speaker
  ON evaluator_requests (meeting_id, speaker_id) WHERE status = 'pending';
