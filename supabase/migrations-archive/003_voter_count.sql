-- Add voter_count to track expected turnout (set by admin at meeting start)
alter table ballots add column if not exists voter_count integer;
