-- ============================================================
-- Member Interest Survey & Club Survey (Toastmasters Item 403).
-- Two lifecycles:
--   * member_interest_surveys: one row per member (fill once);
--     an admin "reset" deletes the row so they can fill again.
--   * club_surveys: admin creates (draft), opens, then closes;
--     members submit once per survey while it's open.
-- Follows the app's permissive RLS pattern (see 001_schema.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS member_interest_surveys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid        NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  responses    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_surveys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_number integer     NOT NULL,
  title         text,
  status        text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_survey_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    uuid        NOT NULL REFERENCES club_surveys(id) ON DELETE CASCADE,
  member_id    uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  responses    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_survey_response_unique UNIQUE (survey_id, member_id)
);

-- ── RLS (permissive — app enforces rules, matching existing tables) ──────────
ALTER TABLE member_interest_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_surveys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_survey_responses   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read member_interest_surveys"  ON member_interest_surveys FOR SELECT USING (true);
CREATE POLICY "public write member_interest_surveys" ON member_interest_surveys FOR ALL    USING (true) WITH CHECK (true);

CREATE POLICY "public read club_surveys"  ON club_surveys FOR SELECT USING (true);
CREATE POLICY "public write club_surveys" ON club_surveys FOR ALL    USING (true) WITH CHECK (true);

CREATE POLICY "public read club_survey_responses"  ON club_survey_responses FOR SELECT USING (true);
CREATE POLICY "public write club_survey_responses" ON club_survey_responses FOR ALL    USING (true) WITH CHECK (true);
