-- Re-add one-vote-per-device-per-category constraint (clean name)
alter table votes
  add constraint votes_once_per_device_category
  unique (ballot_id, device_uuid, category);

-- RPC to check if a device has already voted on a ballot
create or replace function has_voted(p_ballot_id uuid, p_device_uuid text)
returns boolean
security definer
language sql stable
as $$
  select exists (
    select 1 from votes
    where ballot_id = p_ballot_id
      and device_uuid = p_device_uuid
  );
$$;
