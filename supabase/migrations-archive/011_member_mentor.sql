-- Admin-assigned mentor relationship between members.
-- on delete set null so removing a mentor doesn't orphan the mentee row.
alter table members
  add column if not exists mentor_id uuid references members(id) on delete set null;
