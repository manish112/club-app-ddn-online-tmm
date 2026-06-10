ALTER TABLE members
  ADD COLUMN IF NOT EXISTS theme_preference TEXT
    CHECK (theme_preference IN ('dark', 'light'));
