-- Contest ranking options:
--   meetings.contest_show_ranking  — admin toggle for whether ranks are shown.
--   contest_results.overall_rank   — standing across all contestants (vs the
--                                     per-heat `rank`), computed alongside it.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS contest_show_ranking boolean NOT NULL DEFAULT true;
ALTER TABLE contest_results
  ADD COLUMN IF NOT EXISTS overall_rank integer;
