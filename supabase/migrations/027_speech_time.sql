-- Per-prepared-speech allotted time, in minutes (e.g. 5–7).
-- Stored on role_claims; only meaningful when role_key='speaker'.
-- When null, the agenda falls back to the level-based default
-- (L1 → 4–l1_speech_mins, others → 5–other_speech_mins).
alter table role_claims
  add column if not exists speech_min_mins integer check (speech_min_mins between 1 and 60);
alter table role_claims
  add column if not exists speech_max_mins integer check (speech_max_mins between 1 and 60);
