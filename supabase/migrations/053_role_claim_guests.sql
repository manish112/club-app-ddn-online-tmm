-- Guest role holders: someone filling a role who isn't in the members list —
-- a visiting Toastmaster, a guest evaluator, an area director. Only an admin
-- can put one in, by typing the name; there's no member row and no login.
--
-- Mirrors the Table Topics guest convention already stored on ballots
-- ({ id, name, is_guest }), so a guest shows as "Name (Guest)" throughout.
ALTER TABLE role_claims ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE role_claims ADD COLUMN IF NOT EXISTS guest_name text;

-- Exactly one of the two identifies the holder, and a guest must be named.
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_holder_check;
ALTER TABLE role_claims ADD CONSTRAINT role_claims_holder_check
  CHECK (
    ((member_id IS NOT NULL) <> (guest_name IS NOT NULL))
    AND (guest_name IS NULL OR length(btrim(guest_name)) > 0)
  );

-- The one-role-per-member index is partial on (meeting_id, member_id) where not
-- admin_override. Guest rows are always admin_override, and NULL member_ids
-- don't collide in a unique index either way — nothing to change there.
