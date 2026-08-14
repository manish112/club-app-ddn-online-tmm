-- ============================================================
-- Phase 2: Voting
-- ============================================================

-- Ballots (one per meeting)
create table if not exists ballots (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  status        text not null default 'not_started'
                  check (status in ('not_started', 'open', 'closed')),
  meeting_code  text,          -- 4-digit code set by admin when opening
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),

  constraint ballots_meeting_unique unique (meeting_id)
);

-- Votes (one row per device per category per ballot)
create table if not exists votes (
  id                   uuid primary key default gen_random_uuid(),
  ballot_id            uuid not null references ballots(id) on delete cascade,
  device_uuid          text not null,
  voter_member_id      uuid references members(id),   -- stored for self-vote guard only, never exposed
  category             text not null
                         check (category in ('speaker', 'evaluator', 'table_topics')),
  voted_for_member_id  uuid not null references members(id),
  submitted_at         timestamptz not null default now(),

  -- One vote per device per category per ballot
  constraint votes_device_category_unique unique (ballot_id, device_uuid, category)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table ballots enable row level security;
alter table votes   enable row level security;

-- Ballots: anyone can read status/metadata (meeting_code is low-sensitivity for this threat model)
create policy "public read ballots"  on ballots for select using (true);

-- Ballots: anon can insert/update (admin panel uses the anon key)
create policy "anon insert ballots" on ballots for insert with check (true);
create policy "anon update ballots" on ballots for update using (true);

-- Votes: anon can insert only when the ballot is open
create policy "anon insert votes" on votes for insert
  with check (
    exists (
      select 1 from ballots
      where id = ballot_id and status = 'open'
    )
  );

-- Votes: anon cannot select — privacy enforced at DB level
-- (no select policy = denied for anon role)

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table ballots;
alter publication supabase_realtime add table votes;

-- ============================================================
-- Helper functions (SECURITY DEFINER bypasses RLS for aggregates)
-- ============================================================

-- Check if a device has already submitted a vote for a ballot
create or replace function has_device_voted(p_ballot_id uuid, p_device_uuid text)
returns boolean
security definer
language sql stable
as $$
  select exists (
    select 1 from votes
    where ballot_id = p_ballot_id
      and device_uuid = p_device_uuid
    limit 1
  );
$$;

-- Count distinct complete submissions (for the live counter)
create or replace function get_vote_count(p_ballot_id uuid)
returns bigint
security definer
language sql stable
as $$
  select count(distinct device_uuid)
  from votes
  where ballot_id = p_ballot_id;
$$;

-- Aggregate results — no voter identity exposed
create or replace function get_ballot_results(p_ballot_id uuid)
returns table (
  category              text,
  voted_for_member_id   uuid,
  voted_for_display_name text,
  vote_count            bigint
)
security definer
language sql stable
as $$
  select
    v.category,
    v.voted_for_member_id,
    m.display_name as voted_for_display_name,
    count(*) as vote_count
  from votes v
  join members m on m.id = v.voted_for_member_id
  where v.ballot_id = p_ballot_id
  group by v.category, v.voted_for_member_id, m.display_name
  order by v.category, count(*) desc;
$$;
