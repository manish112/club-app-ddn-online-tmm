-- Add gender and avatar_url to members
alter table members
  add column if not exists gender text
    check (gender in ('male', 'female', 'other')),
  add column if not exists avatar_url text;

-- Public storage bucket for member avatars (2 MB limit)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-avatars',
  'member-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- Allow anonymous read/write (app has no Supabase Auth)
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'member-avatars');

create policy "avatars public upload"
  on storage.objects for insert
  with check (bucket_id = 'member-avatars');

create policy "avatars public replace"
  on storage.objects for update
  using (bucket_id = 'member-avatars');
