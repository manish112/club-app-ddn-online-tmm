-- Grant any member guest-management rights
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS can_manage_guests BOOLEAN NOT NULL DEFAULT false;

-- Track when a guest converts to a TM member
ALTER TABLE guest_registrations
  ADD COLUMN IF NOT EXISTS converted_to_member BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
