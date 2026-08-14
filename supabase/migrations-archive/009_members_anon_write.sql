-- Members table only had a public-read policy, so the admin panel (which uses
-- the anon key behind a password-gated URL) hit RLS error 42501 when trying to
-- add a new member or edit display_name / active flag.
-- Follow the same pattern used for meetings/announcements in 001 and 007.
create policy "anon insert members" on members for insert with check (true);
create policy "anon update members" on members for update  using (true);
