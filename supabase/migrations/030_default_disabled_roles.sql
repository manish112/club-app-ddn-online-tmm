-- Club-wide default for which role categories a brand-new meeting opens with.
-- Applied when creating meetings (manual admin form + auto-schedule cron); each
-- meeting keeps its own disabled_roles afterwards and can be overridden per meeting.
-- Array of role_key strings; empty = all roles active by default.
ALTER TABLE agenda_config
  ADD COLUMN IF NOT EXISTS default_disabled_roles text[] NOT NULL DEFAULT '{}';
