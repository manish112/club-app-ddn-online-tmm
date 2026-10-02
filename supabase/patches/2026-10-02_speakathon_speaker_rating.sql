-- =============================================================================
-- Speakathon per-speaker rating (1–10), opened by the admin one speaker at a time.
-- =============================================================================
--
-- Run this in the Supabase SQL editor BEFORE deploying the code that adds
-- per-speaker rating. Safe to run more than once.
--
-- WHY THE ORDER MATTERS. The admin voting panel writes ballots.ballot_mode and
-- ballots.active_speaker_slot when opening, closing or resetting ANY ballot —
-- regular meetings included. Deploy the code first and every one of those
-- actions fails with "column does not exist" until this has run.
--
-- This is also folded into supabase/schema.sql, which is safe to run instead
-- (or afterwards; both are idempotent).
-- =============================================================================

alter table ballots add column if not exists ballot_mode text not null default 'awards'
  check (ballot_mode in ('awards', 'speaker_rating'));
alter table ballots add column if not exists active_speaker_slot integer;
-- Speakers marked as a no-show when their turn came — role_claims ids, so the
-- mark follows the person even if the speaker queue shifts their slot number.
alter table ballots add column if not exists no_show_claim_ids uuid[] not null default '{}';

create table if not exists speaker_ratings (
  id                  uuid primary key default gen_random_uuid(),
  ballot_id           uuid not null references ballots(id) on delete cascade,
  speaker_slot        integer not null,
  device_uuid         text not null,
  voter_member_id     uuid references members(id),
  voted_for_member_id uuid references members(id),
  voted_for_name      text,
  score               smallint not null check (score between 1 and 10),
  submitted_at        timestamptz not null default now(),
  constraint speaker_ratings_once_per_device unique (ballot_id, speaker_slot, device_uuid)
);

create unique index if not exists speaker_ratings_once_per_member
  on speaker_ratings (ballot_id, speaker_slot, voter_member_id)
  where voter_member_id is not null;

create or replace function delete_ballot_votes(p_ballot_id uuid)
returns void security definer language sql as $$
  delete from votes where ballot_id = p_ballot_id;
  delete from speaker_ratings where ballot_id = p_ballot_id;
$$;

create or replace function has_rated_speaker(p_ballot_id uuid, p_speaker_slot integer, p_device_uuid text, p_member_id uuid default null)
returns boolean security definer language sql stable as $$
  select exists (
    select 1 from speaker_ratings
    where ballot_id = p_ballot_id and speaker_slot = p_speaker_slot
      and (device_uuid = p_device_uuid or (p_member_id is not null and voter_member_id = p_member_id))
  );
$$;

create or replace function get_speaker_rating_results(p_ballot_id uuid)
returns table (
  speaker_slot           integer,
  voted_for_member_id    uuid,
  voted_for_display_name text,
  rating_count           bigint,
  total_score            bigint,
  average_score          numeric
) security definer language sql stable as $$
  select
    r.speaker_slot,
    r.voted_for_member_id,
    coalesce(m.display_name, r.voted_for_name, 'Unknown') as voted_for_display_name,
    count(*)                      as rating_count,
    sum(r.score)                  as total_score,
    round(avg(r.score)::numeric, 2) as average_score
  from speaker_ratings r
  left join members m on m.id = r.voted_for_member_id
  where r.ballot_id = p_ballot_id
  group by r.speaker_slot, r.voted_for_member_id, r.voted_for_name, m.display_name
  order by avg(r.score) desc, count(*) desc;
$$;

create or replace function delete_speaker_ratings(p_ballot_id uuid, p_speaker_slot integer)
returns void security definer language sql as $$
  delete from speaker_ratings where ballot_id = p_ballot_id and speaker_slot = p_speaker_slot;
$$;

-- No select policy: ratings are secret, read back only through the functions above.
alter table speaker_ratings enable row level security;
drop policy if exists "anon insert speaker_ratings" on speaker_ratings;
create policy "anon insert speaker_ratings" on speaker_ratings for insert
  with check (
    exists (
      select 1 from ballots b
      where b.id = ballot_id and b.status = 'open'
        and b.ballot_mode = 'speaker_rating'
        and b.active_speaker_slot = speaker_slot
    )
    and (voter_member_id is null or voted_for_member_id is null or voter_member_id <> voted_for_member_id)
  );

-- ── Check it worked ─────────────────────────────────────────────────────────
select ballot_mode, active_speaker_slot from ballots limit 1;
select count(*) from speaker_ratings;
