-- Contest locks (speakathon scoring):
--   contest_locked       — judges can no longer edit their ballots.
--   contest_reset_locked — the admin "reset all scores" action is disabled.
-- The two are independent so reset can be protected without freezing scoring.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS contest_locked       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contest_reset_locked boolean NOT NULL DEFAULT false;
