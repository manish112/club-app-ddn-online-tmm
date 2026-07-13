import type { JuryScore } from './types';

// Toastmasters International Speech Contest ballot (Item 1172, Rev. 05/2024).
// Eight judging items across three categories; suggested point values total 100.
export interface RubricItem {
  key: string;
  category: 'Content' | 'Delivery' | 'Language';
  label: string;
  desc: string;
  max: number;
  // Suggested point bands from the ballot, for on-form guidance.
  bands: { excellent: string; veryGood: string; good: string; fair: string };
}

export const CONTEST_RUBRIC: RubricItem[] = [
  { key: 'speech_development', category: 'Content',  label: 'Speech Development', desc: 'Structure, Organization, Support Material', max: 15,
    bands: { excellent: '15', veryGood: '11–14', good: '6–10', fair: '0–5' } },
  { key: 'effectiveness',      category: 'Content',  label: 'Effectiveness',      desc: 'Clear purpose, Achievement of Purpose, Relevance', max: 10,
    bands: { excellent: '10', veryGood: '7–9', good: '4–6', fair: '0–3' } },
  { key: 'speech_value',       category: 'Content',  label: 'Speech Value',       desc: 'Ideas, Logic, Original Thought', max: 25,
    bands: { excellent: '25', veryGood: '17–24', good: '9–16', fair: '0–8' } },
  { key: 'physical',           category: 'Delivery', label: 'Physical',           desc: 'Appearance, Body Language, Speaking Area', max: 10,
    bands: { excellent: '10', veryGood: '7–9', good: '4–6', fair: '0–3' } },
  { key: 'voice',              category: 'Delivery', label: 'Voice',              desc: 'Flexibility, Volume', max: 10,
    bands: { excellent: '10', veryGood: '7–9', good: '4–6', fair: '0–3' } },
  { key: 'manner',             category: 'Delivery', label: 'Manner',             desc: 'Directness, Assurance, Enthusiasm', max: 10,
    bands: { excellent: '10', veryGood: '7–9', good: '4–6', fair: '0–3' } },
  { key: 'appropriateness',    category: 'Language', label: 'Appropriateness',    desc: 'To Speech Purpose, and Audience', max: 10,
    bands: { excellent: '10', veryGood: '7–9', good: '4–6', fair: '0–3' } },
  { key: 'correctness',        category: 'Language', label: 'Correctness',        desc: 'Grammar, Pronunciation, Word Selection', max: 10,
    bands: { excellent: '10', veryGood: '7–9', good: '4–6', fair: '0–3' } },
];

export const RUBRIC_TOTAL = CONTEST_RUBRIC.reduce((s, i) => s + i.max, 0); // 100

export const RUBRIC_CATEGORIES: { name: RubricItem['category']; max: number }[] = [
  { name: 'Content',  max: 50 },
  { name: 'Delivery', max: 30 },
  { name: 'Language', max: 20 },
];

// Sum of the rubric-item points in a single ballot.
export function scoreTotal(scores: Record<string, number>): number {
  return CONTEST_RUBRIC.reduce((s, item) => s + (Number(scores[item.key]) || 0), 0);
}

export interface ComputedResult {
  contestant_member_id: string;
  item_avgs: Record<string, number>;
  final_score: number;
  rank: number;          // within the heat (== overall_rank when ungrouped)
  overall_rank: number;  // across all contestants
  judge_count: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Assign standard-competition ranks (ties share a rank) within buckets keyed by
// keyOf. Contestants with no ballots (judge_count 0) are left unranked (0).
function assignRanks(results: ComputedResult[], keyOf: (id: string) => string): Map<string, number> {
  const buckets = new Map<string, ComputedResult[]>();
  for (const r of results) {
    if (r.judge_count === 0) continue;
    const k = keyOf(r.contestant_member_id);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }
  const ranks = new Map<string, number>();
  for (const arr of buckets.values()) {
    arr.sort((a, b) => b.final_score - a.final_score);
    let lastScore = Number.POSITIVE_INFINITY;
    let lastRank = 0;
    arr.forEach((r, i) => {
      if (r.final_score < lastScore) { lastRank = i + 1; lastScore = r.final_score; }
      ranks.set(r.contestant_member_id, lastRank);
    });
  }
  return ranks;
}

// Average each rubric item across the judges who scored a contestant, sum to a
// final score, then rank contestants (standard competition ranking: ties share a
// rank, the next rank skips accordingly). When `groupOf` is supplied, ranking is
// done independently within each group (heat). Pure — callers persist the output.
export function computeContestResults(
  scores: JuryScore[],
  contestantIds: string[],
  groupOf?: (contestantId: string) => string,
): ComputedResult[] {
  const byContestant = new Map<string, JuryScore[]>();
  for (const id of contestantIds) byContestant.set(id, []);
  for (const s of scores) {
    if (byContestant.has(s.contestant_member_id)) byContestant.get(s.contestant_member_id)!.push(s);
  }

  const results: ComputedResult[] = contestantIds.map((id) => {
    const ballots = byContestant.get(id) ?? [];
    const item_avgs: Record<string, number> = {};
    for (const item of CONTEST_RUBRIC) {
      if (ballots.length === 0) { item_avgs[item.key] = 0; continue; }
      const sum = ballots.reduce((acc, b) => acc + (Number(b.scores?.[item.key]) || 0), 0);
      item_avgs[item.key] = round1(sum / ballots.length);
    }
    const final_score = round1(CONTEST_RUBRIC.reduce((s, item) => s + item_avgs[item.key], 0));
    return { contestant_member_id: id, item_avgs, final_score, rank: 0, overall_rank: 0, judge_count: ballots.length };
  });

  // Overall standing (everyone) plus per-heat rank (falls back to overall when
  // there's no grouping function).
  const overall = assignRanks(results, () => '__all__');
  const grouped = groupOf ? assignRanks(results, groupOf) : overall;
  for (const r of results) {
    r.overall_rank = overall.get(r.contestant_member_id) ?? 0;
    r.rank = grouped.get(r.contestant_member_id) ?? 0;
  }

  return results;
}
