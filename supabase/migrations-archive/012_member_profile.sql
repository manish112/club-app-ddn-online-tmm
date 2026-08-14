-- Member contact details: phone, email, city — all optional, member-editable.
-- Existing anon update policy from 009 covers writes; no new policy needed.
alter table members
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists city  text;
