-- Admin needs to delete votes on re-open/reset but anon has no DELETE policy.
-- Use a SECURITY DEFINER function so the anon key can trigger a server-side delete.
create or replace function delete_ballot_votes(p_ballot_id uuid)
returns void
security definer
language sql
as $$
  delete from votes where ballot_id = p_ballot_id;
$$;
