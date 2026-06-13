-- guest_registrations (007) only ever had public-read + anon-insert policies.
-- With RLS enabled, the missing UPDATE/DELETE policies meant the guest manager's
-- "Mark as joined TM" (UPDATE) and "Delete" (DELETE) actions were silently
-- filtered to 0 rows — the UI optimistically updated local state, so the change
-- looked applied until the next refresh. Add the same anon-write policies used
-- for members in 009.
create policy "anon update guest_registrations" on guest_registrations for update using (true);
create policy "anon delete guest_registrations" on guest_registrations for delete using (true);
