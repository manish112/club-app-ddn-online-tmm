-- Speakathon speaking order: the sequence of speaker slots (admin-arrangeable).
-- Stored as an array of slot indices; slots not listed fall back to natural order.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS pair_order jsonb NOT NULL DEFAULT '[]'::jsonb;
