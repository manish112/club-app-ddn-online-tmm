-- Speech details for prepared speakers
-- Stored directly on role_claims; only meaningful when role_key='speaker'.
alter table role_claims add column if not exists path          text;
alter table role_claims add column if not exists speech_level  integer check (speech_level between 1 and 5);
alter table role_claims add column if not exists project       text;
alter table role_claims add column if not exists speech_title  text;

-- Allow anon updates so speakers can fill these in after claiming.
-- (App layer restricts edits to own claim or admin.)
create policy "anon update role_claims" on role_claims for update using (true);
