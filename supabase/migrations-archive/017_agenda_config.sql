-- Singleton table for configurable agenda timing values.
-- Only ever one row (id = 1).
CREATE TABLE IF NOT EXISTS agenda_config (
  id                   integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  l1_speech_mins       integer     NOT NULL DEFAULT 6,
  other_speech_mins    integer     NOT NULL DEFAULT 7,
  tt_speaker_count_min integer     NOT NULL DEFAULT 4,
  tt_speaker_count_max integer     NOT NULL DEFAULT 5,
  tt_mins_per_speaker  integer     NOT NULL DEFAULT 2,
  tmod_conclusion_mins integer     NOT NULL DEFAULT 5,
  lock_before_mins     integer     NOT NULL DEFAULT 60,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO agenda_config (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE agenda_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read agenda_config"  ON agenda_config FOR SELECT USING (true);
CREATE POLICY "public write agenda_config" ON agenda_config FOR ALL    USING (true) WITH CHECK (true);
