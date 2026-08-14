-- Adds a manually-grantable admin flag to members.
-- Club President and VP Education receive admin access automatically via
-- app logic; this flag lets any member be granted admin rights directly.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
