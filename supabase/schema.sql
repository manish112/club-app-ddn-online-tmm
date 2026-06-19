-- ============================================================
-- Toastmasters Roles — Consolidated schema (fresh-install only)
-- ============================================================
-- Run this once on a brand-new Supabase project. It produces the
-- same end state as applying migrations 001 through 009 in order.
--
-- For an existing deployment, do NOT run this file. Apply only the
-- migrations that haven't run yet from supabase/migrations/.
-- ============================================================

-- ============================================================
-- Tables
-- ============================================================

create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  membership_no   text unique not null,
  name            text not null,
  display_name    text not null,  -- first-name used in WhatsApp output, editable by admin
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists meetings (
  id              uuid primary key default gen_random_uuid(),
  number          integer unique not null,
  date            date not null,
  start_time      time not null default '10:45:00',
  end_time        time not null default '13:00:00',
  theme           text,
  meeting_type    text not null default 'regular'
                    check (meeting_type in ('regular', 'speakathon')),
  speaker_slots   integer not null default 2,
  evaluator_slots integer not null default 2,
  disabled_roles  text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists role_claims (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references meetings(id) on delete cascade,
  role_key       text not null
                   check (role_key in (
                     'speaker','evaluator','tmod','ttm','ge',
                     'grammarian','ah_counter','timer','harkmaster'
                   )),
  slot_index     integer not null default 1,
  member_id      uuid not null references members(id),
  claimed_at     timestamptz not null default now(),
  admin_override boolean not null default false,
  -- Pathways speech metadata — only meaningful when role_key='speaker'
  path            text,
  speech_level    integer check (speech_level between 1 and 5),
  project         text,
  speech_title    text,
  speech_min_mins integer check (speech_min_mins between 1 and 60),
  speech_max_mins integer check (speech_max_mins between 1 and 60),

  constraint role_claims_slot_unique unique (meeting_id, role_key, slot_index)
);

-- One role per member per meeting, unless admin_override
create unique index if not exists role_claims_one_per_member
  on role_claims (meeting_id, member_id)
  where not admin_override;

create table if not exists ballots (
  id                     uuid primary key default gen_random_uuid(),
  meeting_id             uuid not null references meetings(id) on delete cascade,
  status                 text not null default 'not_started'
                           check (status in ('not_started', 'open', 'closed')),
  meeting_code           text,          -- legacy field, retained for compatibility
  voter_count            integer,       -- expected turnout, auto-closes ballot
  table_topics_speakers  jsonb not null default '[]'::jsonb,
  opened_at              timestamptz,
  closed_at              timestamptz,
  created_at             timestamptz not null default now(),

  constraint ballots_meeting_unique unique (meeting_id)
);

create table if not exists votes (
  id                   uuid primary key default gen_random_uuid(),
  ballot_id            uuid not null references ballots(id) on delete cascade,
  device_uuid          text not null,
  voter_member_id      uuid references members(id),   -- self-vote guard, never exposed
  category             text not null
                         check (category in (
                           'speaker', 'evaluator', 'table_topics',
                           'role_player', 'aux_role'
                         )),
  voted_for_member_id  uuid references members(id),   -- null when voted_for is a guest
  voted_for_name       text,                          -- guest name when member_id is null
  submitted_at         timestamptz not null default now(),

  constraint votes_once_per_device_category unique (ballot_id, device_uuid, category)
);

create table if not exists guest_registrations (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid references meetings(id) on delete set null,
  name        text,
  phone       text not null,
  email       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- App-usage tracking (see migration 025). Server-only access via service role.
create table if not exists device_captures (
  id              uuid primary key default gen_random_uuid(),
  visitor_id      text,
  member_id       uuid references members(id) on delete set null,
  ip              text,
  user_agent      text,
  browser         text,
  browser_version text,
  os              text,
  os_version      text,
  device_type     text,
  device_vendor   text,
  device_model    text,
  screen          text,
  timezone        text,
  languages       text,
  city            text,
  region          text,
  country         text,
  path            text,
  created_at      timestamptz not null default now()
);
create index if not exists device_captures_created_at_idx on device_captures (created_at desc);
create index if not exists device_captures_visitor_idx    on device_captures (visitor_id);
create index if not exists device_captures_member_idx     on device_captures (member_id);

-- ============================================================
-- Row Level Security
-- ============================================================
-- The app uses Supabase's anon key for everything; the admin panel is
-- gated only by an unlisted URL + client-side password. See README's
-- "Security Model" section for the trade-offs.

alter table members             enable row level security;
alter table meetings            enable row level security;
alter table role_claims         enable row level security;
alter table ballots             enable row level security;
alter table votes               enable row level security;
alter table guest_registrations enable row level security;
alter table announcements       enable row level security;
-- device_captures: RLS on with no anon policies — server-only (service role).
alter table device_captures     enable row level security;

-- Public reads
create policy "public read members"             on members             for select using (true);
create policy "public read meetings"            on meetings            for select using (true);
create policy "public read role_claims"         on role_claims         for select using (true);
create policy "public read ballots"             on ballots             for select using (true);
create policy "public read guest_registrations" on guest_registrations for select using (true);
create policy "public read announcements"       on announcements       for select using (true);
-- Note: no select policy on votes — privacy enforced at DB level.
-- Results exposed only via the get_ballot_results SECURITY DEFINER function.

-- Members
create policy "anon insert members" on members for insert with check (true);
create policy "anon update members" on members for update  using (true);

-- Meetings
create policy "anon insert meetings" on meetings for insert with check (true);
create policy "anon update meetings" on meetings for update  using (true);
create policy "anon delete meetings" on meetings for delete  using (true);

-- Role claims (app layer enforces ownership)
create policy "anon insert role_claims" on role_claims for insert with check (true);
create policy "anon update role_claims" on role_claims for update  using (true);
create policy "anon delete role_claims" on role_claims for delete  using (true);

-- Ballots
create policy "anon insert ballots" on ballots for insert with check (true);
create policy "anon update ballots" on ballots for update  using (true);

-- Votes: anon can insert only while the ballot is open
create policy "anon insert votes" on votes for insert
  with check (
    exists (
      select 1 from ballots
      where id = ballot_id and status = 'open'
    )
  );

-- Guest registrations
create policy "anon insert guest_registrations" on guest_registrations for insert with check (true);
create policy "anon update guest_registrations" on guest_registrations for update  using (true);
create policy "anon delete guest_registrations" on guest_registrations for delete  using (true);

-- Announcements
create policy "anon insert announcements" on announcements for insert with check (true);
create policy "anon update announcements" on announcements for update  using (true);
create policy "anon delete announcements" on announcements for delete  using (true);

-- ============================================================
-- Functions (SECURITY DEFINER bypasses RLS for aggregates + admin actions)
-- ============================================================

-- Has this device already voted on this ballot?
create or replace function has_voted(p_ballot_id uuid, p_device_uuid text)
returns boolean
security definer
language sql stable
as $$
  select exists (
    select 1 from votes
    where ballot_id = p_ballot_id
      and device_uuid = p_device_uuid
  );
$$;

-- Live count of distinct devices that have submitted votes
create or replace function get_vote_count(p_ballot_id uuid)
returns bigint
security definer
language sql stable
as $$
  select count(distinct device_uuid)
  from votes
  where ballot_id = p_ballot_id;
$$;

-- Aggregated results — voter identity never exposed
create or replace function get_ballot_results(p_ballot_id uuid)
returns table (
  category               text,
  voted_for_member_id    uuid,
  voted_for_display_name text,
  vote_count             bigint
)
security definer
language sql stable
as $$
  select
    v.category,
    v.voted_for_member_id,
    coalesce(m.display_name, v.voted_for_name, 'Unknown') as voted_for_display_name,
    count(*) as vote_count
  from votes v
  left join members m on m.id = v.voted_for_member_id
  where v.ballot_id = p_ballot_id
  group by v.category, v.voted_for_member_id, v.voted_for_name, m.display_name
  order by v.category, count(*) desc;
$$;

-- Admin reset: anon has no DELETE on votes, so go through a definer fn
create or replace function delete_ballot_votes(p_ballot_id uuid)
returns void
security definer
language sql
as $$
  delete from votes where ballot_id = p_ballot_id;
$$;

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table role_claims;
alter publication supabase_realtime add table ballots;
alter publication supabase_realtime add table votes;
