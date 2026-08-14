-- Allow a member to hold MULTIPLE leadership roles, and add Treasurer +
-- Sergeant at Arms. Replaces the single `leadership_role` text column with a
-- `leadership_roles` text[] array. Exclusivity (one holder per role) is now
-- enforced in the app layer (the admin UI shows who already holds a role).
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS leadership_roles text[] NOT NULL DEFAULT '{}';

-- Migrate any existing single role into the new array.
UPDATE members
  SET leadership_roles = ARRAY[leadership_role]::text[]
  WHERE leadership_role IS NOT NULL
    AND COALESCE(array_length(leadership_roles, 1), 0) = 0;

-- Drop the old single-column exclusivity index and value check; the old
-- `leadership_role` column is left in place (unused) for safety.
DROP INDEX IF EXISTS members_exclusive_leadership;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_leadership_role_check;
