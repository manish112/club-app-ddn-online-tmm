-- App-usage tracking: one row per app-open "session", recording where and on
-- what the app is being used. Populated only server-side by /api/capture using
-- the service-role key (which bypasses RLS), so the raw IP and other signals are
-- never writable or readable through the public anon key.
create table if not exists device_captures (
  id              uuid primary key default gen_random_uuid(),
  visitor_id      text,                       -- FingerprintJS visitorId (stable across storage clears)
  member_id       uuid references members(id) on delete set null,  -- linked when signed in
  ip              text,                       -- raw client IP (admin-only via server route)
  user_agent      text,
  browser         text,
  browser_version text,
  os              text,
  os_version      text,
  device_type     text,                       -- mobile | tablet | desktop | …
  device_vendor   text,
  device_model    text,
  screen          text,                       -- e.g. "390x844@2"
  timezone        text,
  languages       text,
  city            text,                        -- best-effort geo from IP
  region          text,
  country         text,
  path            text,                        -- pathname the capture fired from
  created_at      timestamptz not null default now()
);

create index if not exists device_captures_created_at_idx on device_captures (created_at desc);
create index if not exists device_captures_visitor_idx    on device_captures (visitor_id);
create index if not exists device_captures_member_idx     on device_captures (member_id);

-- RLS on with NO anon policies: the publishable/anon key can neither read nor
-- write this table. All access goes through the server using the service role.
alter table device_captures enable row level security;
