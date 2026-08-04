-- Special sessions.
--
-- A meeting can be flagged as a special session (club anniversary, joint
-- meeting, festive theme…). It's a marker on top of the existing format — a
-- speakathon or Table Topics session can be special too — so it's a flag rather
-- than another meeting_type value. Nothing about the running order changes:
-- the TMoD still facilitates and the same roles apply.
--
-- The meeting's existing `theme` doubles as the session title, so there's no
-- separate name column. `special_session_note` is one free line of detail shown
-- in the app and the WhatsApp agenda, keeping the wording in admins' hands.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_special_session boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_session_note text;
