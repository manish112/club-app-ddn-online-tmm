-- Club officer / leadership roles assignable by admin.
-- Club Mentor is non-exclusive (multiple members can hold it).
-- All other roles are exclusive — enforced by the partial unique index.
alter table members
  add column if not exists leadership_role text
  check (leadership_role in ('president', 'vp_education', 'secretary', 'vp_pr', 'club_mentor'));

create unique index if not exists members_exclusive_leadership
  on members (leadership_role)
  where leadership_role in ('president', 'vp_education', 'secretary', 'vp_pr');
