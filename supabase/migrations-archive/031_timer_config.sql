-- Club-wide speech-timer thresholds (seconds) for the public /timer page.
-- One JSONB blob keyed by mode; each mode has green/yellow/red/grace seconds.
-- Defaults follow the official Toastmasters 675E Timer Script.
ALTER TABLE agenda_config
  ADD COLUMN IF NOT EXISTS timer_modes jsonb NOT NULL DEFAULT '{
    "icebreaker":  {"green": 240, "yellow": 300, "red": 360, "grace": 30},
    "speech":      {"green": 300, "yellow": 360, "red": 420, "grace": 30},
    "tabletopics": {"green": 60,  "yellow": 90,  "red": 120, "grace": 30},
    "evaluation":  {"green": 120, "yellow": 150, "red": 180, "grace": 30}
  }'::jsonb;
