-- ============================================================
-- Dehradun WIC India Toastmasters — Role Booking App
-- ============================================================

-- Members
create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  membership_no   text unique not null,
  name            text not null,
  display_name    text not null,  -- first-name used in WhatsApp output, editable by admin
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Meetings
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
  created_at      timestamptz not null default now()
);

-- Role claims
create table if not exists role_claims (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references meetings(id) on delete cascade,
  role_key       text not null
                   check (role_key in (
                     'speaker','evaluator','tmod','ttm','ge',
                     'grammarian','ah_counter','timer','harkmaster'
                   )),
  slot_index     integer not null default 1,  -- 1,2,3… for speaker/evaluator; always 1 for singles
  member_id      uuid not null references members(id),
  claimed_at     timestamptz not null default now(),
  admin_override boolean not null default false,

  -- Each slot has at most one claimant
  constraint role_claims_slot_unique unique (meeting_id, role_key, slot_index)
);

-- One role per member per meeting, unless admin_override
create unique index role_claims_one_per_member
  on role_claims (meeting_id, member_id)
  where not admin_override;

-- ============================================================
-- Row Level Security (permissive — no auth in Phase 1)
-- ============================================================

alter table members    enable row level security;
alter table meetings   enable row level security;
alter table role_claims enable row level security;

-- Everyone can read everything
create policy "public read members"     on members     for select using (true);
create policy "public read meetings"    on meetings    for select using (true);
create policy "public read role_claims" on role_claims for select using (true);

-- Anyone can insert/delete role_claims (app layer enforces ownership)
create policy "anon insert role_claims" on role_claims for insert with check (true);
create policy "anon delete role_claims" on role_claims for delete using (true);

-- Admin UI uses anon key — allow meeting writes (URL is hidden, page is password-gated)
create policy "anon insert meetings" on meetings for insert with check (true);
create policy "anon update meetings" on meetings for update  using (true);
create policy "anon delete meetings" on meetings for delete  using (true);

-- ============================================================
-- Realtime
-- ============================================================

-- Make role_claims broadcast changes to subscribers
alter publication supabase_realtime add table role_claims;
