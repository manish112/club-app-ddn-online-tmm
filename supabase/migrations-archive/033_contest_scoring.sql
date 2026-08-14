-- Speakathon contest scoring (International Speech Contest ballot, Item 1172).
-- jury_scores: one 8-item rubric ballot per (meeting, judge, contestant).
-- contest_results: admin-computed per-contestant averages, final score, rank & reveal flag.
create table if not exists jury_scores (
  id                   uuid primary key default gen_random_uuid(),
  meeting_id           uuid not null references meetings(id) on delete cascade,
  judge_member_id      uuid not null references members(id),
  contestant_member_id uuid not null references members(id),
  scores               jsonb   not null default '{}'::jsonb,  -- { rubricKey: points }
  total                integer not null default 0,
  updated_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint jury_scores_unique unique (meeting_id, judge_member_id, contestant_member_id)
);

create table if not exists contest_results (
  id                   uuid primary key default gen_random_uuid(),
  meeting_id           uuid not null references meetings(id) on delete cascade,
  contestant_member_id uuid not null references members(id),
  item_avgs            jsonb   not null default '{}'::jsonb,  -- { rubricKey: avg }
  final_score          numeric not null default 0,
  rank                 integer,
  judge_count          integer not null default 0,
  revealed             boolean not null default false,
  computed_at          timestamptz not null default now(),
  constraint contest_results_unique unique (meeting_id, contestant_member_id)
);

-- RLS: public read + anon writes (consistent with role_claims etc.); the UI gates
-- who actually sees individual judge scores / unrevealed results.
alter table jury_scores     enable row level security;
alter table contest_results enable row level security;
create policy "public read jury_scores"       on jury_scores     for select using (true);
create policy "anon insert jury_scores"       on jury_scores     for insert with check (true);
create policy "anon update jury_scores"       on jury_scores     for update using (true);
create policy "anon delete jury_scores"       on jury_scores     for delete using (true);
create policy "public read contest_results"   on contest_results for select using (true);
create policy "anon insert contest_results"   on contest_results for insert with check (true);
create policy "anon update contest_results"   on contest_results for update using (true);
create policy "anon delete contest_results"   on contest_results for delete using (true);
