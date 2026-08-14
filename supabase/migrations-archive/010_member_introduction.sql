-- Add a free-text introduction that members can write about themselves.
-- Existing anon update policy from 009 covers writes; no new policy needed.
alter table members add column if not exists introduction text;
