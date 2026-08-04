-- Role interest requests.
--
-- While the online-only reservation window is active (migration 049) an
-- in-person member can't claim a role directly. Instead they register interest
-- in a specific role and an approver — Club President, VP Education or any
-- admin — approves it (which assigns the role) or declines it with a comment.
-- Mirrors speaker_slot_requests, which covers the "I want to speak" case.
CREATE TABLE IF NOT EXISTS role_interest_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id      UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role_key       TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  request_note   TEXT,
  reviewer_id    UUID        REFERENCES members(id),
  review_comment TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One live request per member per role per meeting; re-requesting the same
  -- role after a denial reuses the row.
  UNIQUE (meeting_id, member_id, role_key)
);

CREATE INDEX IF NOT EXISTS role_interest_requests_status_idx
  ON role_interest_requests (status);

GRANT ALL ON role_interest_requests TO anon;
ALTER TABLE role_interest_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON role_interest_requests FOR ALL TO anon USING (true) WITH CHECK (true);
