-- =============================================================================
-- Speaker slots as a queue: close gaps when a speaker drops, and clean up
-- the gaps already in upcoming meetings.
-- =============================================================================
--
-- Run this in the Supabase SQL editor. Safe to run more than once. Run
-- 2026-10-02_speakathon_speaker_rating.sql FIRST — this function also shifts
-- speaker_ratings and ballots.active_speaker_slot.
--
-- Until it has run the app keeps working the old way (the vacated slot stays
-- as an empty gap); RoleSlot falls back when the function is missing.
--
-- Also folded into supabase/schema.sql.
-- =============================================================================

-- A speaker giving up their slot (or an admin removing them) closes the gap:
-- their speaker + paired evaluator claims go, and every pair below moves up
-- one place, so the agenda never shows a hole between two speakers. Done here,
-- in one transaction, because speaker/evaluator pairing is positional and
-- several tables key on the slot number — a half-applied shift from the
-- browser would pair evaluators with the wrong speakers.
--
-- The slot count shrinks by one but never below base_speaker_slots (nor 1):
-- at the configured minimum, the freed slot reappears empty at the bottom for
-- someone else to claim, exactly as trimming extra slots already behaves.
create or replace function remove_speaker_slot(p_meeting_id uuid, p_slot integer)
returns void security definer language plpgsql as $$
declare
  v_slots  integer;
  v_base   integer;
  v_order  jsonb;
  v_groups jsonb;
  v_new    integer;
begin
  select speaker_slots, base_speaker_slots, pair_order, pair_groups
    into v_slots, v_base, v_order, v_groups
    from meetings where id = p_meeting_id
    for update;
  if not found or p_slot < 1 or p_slot > v_slots then return; end if;

  delete from role_claims
   where meeting_id = p_meeting_id and role_key in ('speaker', 'evaluator') and slot_index = p_slot;
  update evaluator_requests set status = 'cancelled'
   where meeting_id = p_meeting_id and speaker_slot_index = p_slot and status = 'pending';
  delete from speaker_ratings
   where speaker_slot = p_slot and ballot_id in (select id from ballots where meeting_id = p_meeting_id);

  -- Shift through negatives: a plain "slot_index - 1" can trip the unique
  -- (meeting_id, role_key, slot_index) mid-statement, row order not guaranteed.
  update role_claims set slot_index = -slot_index
   where meeting_id = p_meeting_id and role_key in ('speaker', 'evaluator') and slot_index > p_slot;
  update role_claims set slot_index = -slot_index - 1
   where meeting_id = p_meeting_id and role_key in ('speaker', 'evaluator') and slot_index < 0;

  update evaluator_requests set speaker_slot_index = speaker_slot_index - 1
   where meeting_id = p_meeting_id and speaker_slot_index > p_slot;

  update speaker_ratings set speaker_slot = -speaker_slot
   where speaker_slot > p_slot and ballot_id in (select id from ballots where meeting_id = p_meeting_id);
  update speaker_ratings set speaker_slot = -speaker_slot - 1
   where speaker_slot < 0 and ballot_id in (select id from ballots where meeting_id = p_meeting_id);

  update ballots set active_speaker_slot = case
      when active_speaker_slot = p_slot then null
      when active_speaker_slot > p_slot then active_speaker_slot - 1
      else active_speaker_slot end
   where meeting_id = p_meeting_id and active_speaker_slot is not null;

  -- Speaking order and heat assignment are keyed by slot number too.
  v_order := coalesce((
    select jsonb_agg(case when e::int > p_slot then e::int - 1 else e::int end order by ord)
      from jsonb_array_elements_text(coalesce(v_order, '[]'::jsonb)) with ordinality as t(e, ord)
     where e::int <> p_slot), '[]'::jsonb);
  v_groups := coalesce((
    select jsonb_object_agg(case when k::int > p_slot then (k::int - 1)::text else k end, v)
      from jsonb_each(coalesce(v_groups, '{}'::jsonb)) as t(k, v)
     where k::int <> p_slot), '{}'::jsonb);

  v_new := greatest(coalesce(v_base, 1), v_slots - 1, 1);
  update meetings set
    pair_order  = v_order,
    pair_groups = v_groups,
    speaker_slots   = v_new,
    evaluator_slots = case when v_new <> v_slots then v_new else evaluator_slots end
   where id = p_meeting_id;
end;
$$;

-- Speaker slots behave as a QUEUE: filled pairs always sit at the top in
-- order, open slots collect at the bottom. This closes every gap — a slot
-- with neither a speaker nor an evaluator, sitting above a filled speaker —
-- by removing it through remove_speaker_slot, which moves the pairs below up.
-- A slot whose evaluator is already signed up (waiting for a speaker) is left
-- alone: removing it would silently drop that evaluator. Called after every
-- speaker sign-up, since a member can pick any open slot.
create or replace function compact_speaker_slots(p_meeting_id uuid)
returns void security definer language plpgsql as $$
declare
  v_slot integer;
begin
  loop
    v_slot := null;
    select s into v_slot
      from generate_series(1, (select speaker_slots from meetings where id = p_meeting_id)) as s
     where not exists (
             select 1 from role_claims
              where meeting_id = p_meeting_id and role_key in ('speaker', 'evaluator') and slot_index = s)
       and exists (
             select 1 from role_claims
              where meeting_id = p_meeting_id and role_key = 'speaker' and slot_index > s)
     order by s
     limit 1;
    exit when v_slot is null;
    perform remove_speaker_slot(p_meeting_id, v_slot);
  end loop;
end;
$$;

-- ── One-time cleanup ────────────────────────────────────────────────────────
-- Close the gaps already sitting in upcoming meetings (past meetings are left
-- exactly as they happened). THIS EDITS DATA: it renumbers speaker/evaluator
-- claims in every meeting dated today or later. To preview first:
--
--   select number, date, speaker_slots from meetings where date >= current_date;
do $$
declare m record;
begin
  for m in select id from meetings where date >= current_date and not cancelled loop
    perform compact_speaker_slots(m.id);
  end loop;
end $$;
