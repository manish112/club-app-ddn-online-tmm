-- ============================================================
-- Ballot v2: TT speakers, new vote categories, guest support
-- ============================================================

-- TT speakers list stored on the ballot (array of {id, name, is_guest})
alter table ballots
  add column if not exists table_topics_speakers jsonb not null default '[]'::jsonb;

-- Allow guests as vote targets (drop NOT NULL so guest rows use voted_for_name instead)
alter table votes alter column voted_for_member_id drop not null;
alter table votes add column if not exists voted_for_name text;

-- Extend category constraint to include new award types
alter table votes drop constraint if exists votes_category_check;
alter table votes add constraint votes_category_check
  check (category in ('speaker', 'evaluator', 'table_topics', 'role_player', 'aux_role'));

-- Updated get_ballot_results: handles guest names + new categories
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
