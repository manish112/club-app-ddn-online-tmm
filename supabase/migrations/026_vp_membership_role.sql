-- Add "VP Membership" as an exclusive leadership role.
-- Extends the check constraint and the partial unique index from 013_leadership_roles.sql.

alter table members
  drop constraint if exists members_leadership_role_check;

alter table members
  add constraint members_leadership_role_check
  check (leadership_role in ('president', 'vp_education', 'vp_membership', 'secretary', 'vp_pr', 'club_mentor'));

drop index if exists members_exclusive_leadership;

create unique index if not exists members_exclusive_leadership
  on members (leadership_role)
  where leadership_role in ('president', 'vp_education', 'vp_membership', 'secretary', 'vp_pr');
