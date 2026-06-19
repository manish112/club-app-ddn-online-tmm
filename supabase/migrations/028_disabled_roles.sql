-- Per-meeting disabled role categories, so admins can turn off any slot/category
-- (e.g. a Speakathon with no Table Topics, or a Table-Topics session with no
-- prepared speeches). Array of role_key strings; empty = all roles active.
-- Legacy meeting_type='speakathon' rows continue to imply Table Topics off
-- (handled in app code) without needing a backfill here.
alter table meetings
  add column if not exists disabled_roles text[] not null default '{}';
