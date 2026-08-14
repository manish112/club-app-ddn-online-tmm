-- Guest registrations
create table if not exists guest_registrations (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid references meetings(id) on delete set null,
  name        text,
  phone       text not null,
  email       text not null,
  created_at  timestamptz not null default now()
);

alter table guest_registrations enable row level security;
create policy "public read guest_registrations" on guest_registrations for select using (true);
create policy "anon insert guest_registrations" on guest_registrations for insert with check (true);

-- Announcements (one active at a time)
create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table announcements enable row level security;
create policy "public read announcements"  on announcements for select using (true);
create policy "anon insert announcements"  on announcements for insert with check (true);
create policy "anon update announcements"  on announcements for update  using (true);
create policy "anon delete announcements"  on announcements for delete  using (true);
