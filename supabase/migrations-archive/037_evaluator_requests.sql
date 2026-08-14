-- Speaker-chosen evaluator with officer approval.
--
-- When a member claims a Prepared Speaker slot (or requests an extra speaking
-- slot) they may nominate a preferred evaluator. That nomination becomes a
-- pending request approved by any officer/admin; until approved the paired
-- evaluator slot (evaluator slot index = speaker slot index) is blocked and
-- shows "Assignment in progress". On approval the nominee is auto-assigned.

CREATE TABLE IF NOT EXISTS evaluator_requests (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id             UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_slot_index     INT         NOT NULL,                 -- paired evaluator slot = same index
  speaker_id             UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  preferred_evaluator_id UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status                 TEXT        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  reviewer_id            UUID        REFERENCES members(id),
  review_comment         TEXT,
  reviewed_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, speaker_slot_index)
);

GRANT ALL ON evaluator_requests TO anon;
ALTER TABLE evaluator_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON evaluator_requests FOR ALL TO anon USING (true) WITH CHECK (true);

-- Extra-speaker-slot requests can also carry a preferred evaluator, materialized
-- into an evaluator_requests row when the extra slot is approved.
ALTER TABLE speaker_slot_requests
  ADD COLUMN IF NOT EXISTS preferred_evaluator_id UUID REFERENCES members(id);
