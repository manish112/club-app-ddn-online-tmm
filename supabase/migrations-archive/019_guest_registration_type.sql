ALTER TABLE guest_registrations
  ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'attendance'
    CHECK (registration_type IN ('attendance', 'inquiry'));
