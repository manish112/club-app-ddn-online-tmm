# Archived migrations (001–058)

**Nothing here needs to run.** `supabase/schema.sql` is the whole database now —
one file that both creates a new one and brings an old one up to current.

These 59 files are the incremental history that built the schema between the
first release and August 2026. They are kept because the *reasons* for a design
are written in their comments (why WhatsApp has an admin gate as well as a
member opt-out, why evaluator requests are unique per speaker rather than per
slot, why the ballot has no select policy) and that context is worth more than
the DDL. `schema.sql` carries the same reasoning forward in condensed form.

## Do not run these against a new database

They no longer reflect what the app expects on their own, and the folder is
named so the Supabase CLI will not pick it up as a migration directory. Two
things in here would also trip you up:

- There are **two `014_` files** (`014_meeting_attendees.sql` and
  `014_member_avatar_gender.sql`) — a numbering collision from parallel work.
- Migration **048** unconditionally sets the club's meeting day to Saturday,
  so re-running it would overwrite a day an admin had since changed.

Both are resolved in `schema.sql`.

## Adding a schema change from here on

Edit `supabase/schema.sql` directly. Keep every statement idempotent —
`create table if not exists`, `add column if not exists`, `create or replace`,
and drop-then-create for policies (Postgres has no `create policy if not
exists`) — so the file stays safe to re-run against a live database. That
property is what replaced the numbered-migration workflow.
