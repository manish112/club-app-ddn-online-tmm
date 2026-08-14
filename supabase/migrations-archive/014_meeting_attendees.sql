-- Tracks members who have confirmed attendance for a meeting
-- without necessarily claiming a role.
create table if not exists meeting_attendees (
  meeting_id uuid not null references meetings(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, member_id)
);

alter table meeting_attendees enable row level security;
create policy "public read attendees"  on meeting_attendees for select using (true);
create policy "anon insert attendees"  on meeting_attendees for insert with check (true);
create policy "anon delete attendees"  on meeting_attendees for delete using (true);
