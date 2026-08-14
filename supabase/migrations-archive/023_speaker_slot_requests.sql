CREATE TABLE IF NOT EXISTS speaker_slot_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id    UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'denied')),
  request_note TEXT,
  reviewer_id  UUID        REFERENCES members(id),
  review_comment TEXT,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, member_id)
);

GRANT ALL ON speaker_slot_requests TO anon;
ALTER TABLE speaker_slot_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON speaker_slot_requests FOR ALL TO anon USING (true) WITH CHECK (true);
