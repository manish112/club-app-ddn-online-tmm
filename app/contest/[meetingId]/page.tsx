'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { useIdentity } from '@/hooks/useIdentity';
import type { ContestResult, JuryScore, Member, MeetingWithClaims } from '@/lib/types';
import { formatMeetingDate, groupIdForSlot, hasSpeakerGroups } from '@/lib/utils';
import { CONTEST_RUBRIC, RUBRIC_TOTAL, computeContestResults } from '@/lib/contest';

export default function ContestResultsPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { memberId, loaded } = useIdentity();
  const supabase = createClient();

  const [me, setMe] = useState<Member | null>(null);
  const [meeting, setMeeting] = useState<MeetingWithClaims | null>(null);
  const [scores, setScores] = useState<JuryScore[]>([]);
  const [results, setResults] = useState<ContestResult[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [{ data: mtg }, { data: sc }, { data: res }, { data: mem }] = await Promise.all([
      supabase.from('meetings').select('*, role_claims(*, member:members(*))').eq('id', meetingId).single(),
      supabase.from('jury_scores').select('*').eq('meeting_id', meetingId),
      supabase.from('contest_results').select('*').eq('meeting_id', meetingId),
      supabase.from('members').select('*'),
    ]);
    setMeeting((mtg as MeetingWithClaims) ?? null);
    setScores((sc as JuryScore[]) ?? []);
    setResults((res as ContestResult[]) ?? []);
    setMembers((mem as Member[]) ?? []);
  }, [meetingId, supabase]);

  useEffect(() => {
    if (!memberId || memberId === 'guest') { setLoading(false); return; }
    supabase.from('members').select('*').eq('id', memberId).single()
      .then(({ data }) => setMe((data as Member) ?? null));
  }, [memberId, supabase]);

  useEffect(() => {
    if (!loaded) return;
    loadAll().finally(() => setLoading(false));
  }, [loaded, loadAll]);

  // Same access rule as the admin panel: full admins plus President / VP Education.
  // Admins (incl. President / VP Education) can compute & reveal; assigned jury
  // members get a read-only view of the results.
  const isAdmin = !!me && (me.is_admin || me.leadership_role === 'president' || me.leadership_role === 'vp_education');

  if (!loaded || loading) return <Centered>Loading…</Centered>;
  if (!meeting) return <Centered>Meeting not found.</Centered>;

  const isJudge = !!memberId && meeting.role_claims.some((c) => c.role_key === 'jury' && c.member_id === memberId);
  if (!isAdmin && !isJudge) {
    return (
      <Centered>
        <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Results are private.</p>
        <p className="text-sm text-slate-400">Only admins and this meeting’s jury can view them.</p>
      </Centered>
    );
  }

  const locked = meeting.contest_locked;
  const resetLocked = meeting.contest_reset_locked;
  const showRanking = meeting.contest_show_ranking;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—';

  const contestants = meeting.role_claims
    .filter((c) => c.role_key === 'speaker' && c.member_id && c.slot_index <= meeting.speaker_slots)
    .map((c) => ({ slot: c.slot_index, id: c.member_id }))
    .sort((a, b) => a.slot - b.slot);
  const contestantIds = contestants.map((c) => c.id);
  const judgeIds = Array.from(new Set(meeting.role_claims.filter((c) => c.role_key === 'jury').map((c) => c.member_id)));

  // Group helpers: contestant → their heat (for per-group ranking & display).
  const grouped = hasSpeakerGroups(meeting);
  const slotOf = new Map(contestants.map((c) => [c.id, c.slot]));
  const groupIdOf = (id: string) => groupIdForSlot(meeting, slotOf.get(id) ?? 0);

  const expectedBallots = judgeIds.length * contestants.length;
  const submitted = scores.filter((s) => contestantIds.includes(s.contestant_member_id) && judgeIds.includes(s.judge_member_id)).length;
  const complete = expectedBallots > 0 && submitted >= expectedBallots;

  const scoresByContestant = new Map<string, JuryScore[]>();
  for (const s of scores) {
    if (!scoresByContestant.has(s.contestant_member_id)) scoresByContestant.set(s.contestant_member_id, []);
    scoresByContestant.get(s.contestant_member_id)!.push(s);
  }

  async function compute() {
    setComputing(true);
    // Rank within each heat when the meeting is grouped.
    const groupOf = grouped ? (id: string) => String(groupIdOf(id) ?? 'unassigned') : undefined;
    const computed = computeContestResults(scores, contestantIds, groupOf);
    const revealedBy = new Map(results.map((r) => [r.contestant_member_id, r.revealed]));
    const rows = computed.map((r) => ({
      meeting_id: meetingId,
      contestant_member_id: r.contestant_member_id,
      item_avgs: r.item_avgs,
      final_score: r.final_score,
      rank: r.rank || null,
      overall_rank: r.overall_rank || null,
      judge_count: r.judge_count,
      revealed: revealedBy.get(r.contestant_member_id) ?? false,
      computed_at: new Date().toISOString(),
    }));
    await supabase.from('contest_results').upsert(rows, { onConflict: 'meeting_id,contestant_member_id' });
    await loadAll();
    setComputing(false);
  }

  async function toggleReveal(contestantId: string, revealed: boolean) {
    await supabase.from('contest_results').update({ revealed }).eq('meeting_id', meetingId).eq('contestant_member_id', contestantId);
    await loadAll();
  }

  async function resetScores() {
    if (locked || resetLocked) return;
    if (!confirm('Reset ALL judges’ scores for this meeting? This deletes every ballot and the computed results. This cannot be undone.')) return;
    await supabase.from('jury_scores').delete().eq('meeting_id', meetingId);
    await supabase.from('contest_results').delete().eq('meeting_id', meetingId);
    await loadAll();
  }

  async function setLocked(next: boolean) {
    await supabase.from('meetings').update({ contest_locked: next }).eq('id', meetingId);
    await loadAll();
  }

  async function setResetLocked(next: boolean) {
    await supabase.from('meetings').update({ contest_reset_locked: next }).eq('id', meetingId);
    await loadAll();
  }

  async function setShowRanking(next: boolean) {
    await supabase.from('meetings').update({ contest_show_ranking: next }).eq('id', meetingId);
    await loadAll();
  }

  // Within a heat, order by rank when shown, else by score.
  const ranked = [...results].sort((a, b) =>
    showRanking ? (a.rank ?? 99) - (b.rank ?? 99) || b.final_score - a.final_score
                : b.final_score - a.final_score);

  // Overall standing across all contestants (by overall_rank).
  const overallStanding = [...results]
    .filter((r) => r.judge_count > 0)
    .sort((a, b) => (a.overall_rank ?? 99) - (b.overall_rank ?? 99) || b.final_score - a.final_score);

  // Results split by heat, each list ordered by its within-group rank.
  const resultBuckets: { name: string | null; items: typeof ranked }[] = grouped
    ? [
        ...meeting.speaker_groups.map((g) => ({ name: g.name, items: ranked.filter((r) => groupIdOf(r.contestant_member_id) === g.id) })),
        { name: 'Unassigned', items: ranked.filter((r) => groupIdOf(r.contestant_member_id) === null) },
      ].filter((b) => b.items.length > 0)
    : [{ name: null, items: ranked }];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href={isAdmin ? '/amiadmin' : '/'} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">← Back</Link>
          {isAdmin && (
            <Link href={`/contest/${meeting.id}/scores`} className="text-sm font-semibold text-maroon-600 dark:text-maroon-400 hover:text-maroon-800 dark:hover:text-maroon-300 transition-colors">📊 Judge scorecards →</Link>
          )}
        </div>

        <div className="mt-4 mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Speech Contest · Results</p>
          <h1 className="font-serif text-2xl font-black text-slate-900 dark:text-white">Meeting #{meeting.number}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{formatMeetingDate(meeting.date)}</p>
        </div>

        {/* Progress + compute */}
        <div className={`rounded-2xl border p-4 mb-5 ${complete
          ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
          : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'}`}>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {judgeIds.length} judge{judgeIds.length === 1 ? '' : 's'} · {contestants.length} contestant{contestants.length === 1 ? '' : 's'}
          </p>
          <p className={`text-sm ${complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {submitted} / {expectedBallots} ballots submitted{complete ? ' — all in ✓' : ' — still incomplete'}
          </p>
          {locked && (
            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">🔒 Scoring locked — judges can no longer edit their ballots.</p>
          )}
          {isAdmin && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={compute} disabled={computing || contestants.length === 0}
                  className="bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                             text-white rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm">
                  {computing ? 'Computing…' : results.length ? 'Recompute scores' : 'Compute scores'}
                </button>
                <button
                  onClick={() => setLocked(!locked)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] border transition-all active:scale-95
                             border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800">
                  {locked ? '🔓 Unlock scoring' : '🔒 Lock scoring'}
                </button>
                <button
                  onClick={resetScores}
                  disabled={locked || resetLocked}
                  title={resetLocked ? 'Reset is disabled' : locked ? 'Scoring is locked' : undefined}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] border transition-all active:scale-95
                             border-red-300 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20
                             disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                  Reset all scores
                </button>
                <button
                  onClick={() => setResetLocked(!resetLocked)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] border transition-all active:scale-95
                             border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800">
                  {resetLocked ? '↩︎ Enable reset' : '🚫 Disable reset'}
                </button>
                <button
                  onClick={() => setShowRanking(!showRanking)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] border transition-all active:scale-95
                             border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800">
                  {showRanking ? '🙈 Hide ranking' : '🏅 Show ranking'}
                </button>
              </div>
              {!complete && !locked && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  You can compute now; averages will use whatever ballots are in so far.
                </p>
              )}
            </>
          )}
        </div>

        {/* Overall standing (across all heats) */}
        {showRanking && grouped && overallStanding.length > 0 && (
          <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-900 dark:bg-slate-800 text-white text-sm font-black uppercase tracking-widest">🏆 Overall Standing</div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {overallStanding.map((r) => (
                <div key={r.contestant_member_id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-slate-900 dark:bg-slate-700 text-white flex items-center justify-center text-xs font-black">{r.overall_rank ?? '—'}</span>
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">TM {nameOf(r.contestant_member_id)}</span>
                  <span className="shrink-0 tabular-nums font-black text-slate-900 dark:text-white">{Number(r.final_score)}<span className="text-xs font-medium text-slate-400"> / {RUBRIC_TOTAL}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results — {grouped ? 'by heat' : 'ranked'} */}
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-400">No results computed yet.</p>
        ) : (
          <div className="space-y-6">
            {resultBuckets.map((bucket, bi) => (
              <div key={bi}>
                {bucket.name && (
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-maroon-700 to-maroon-600 text-white text-sm font-black px-3 py-1.5 shadow-sm">
                      🏆 {bucket.name}
                    </span>
                    <div className="flex-1 h-px bg-maroon-200 dark:bg-maroon-900/50" />
                  </div>
                )}
                <div className="space-y-3">
                  {bucket.items.map((r) => {
                    const isOpen = expanded === r.contestant_member_id;
                    const judgeBallots = scoresByContestant.get(r.contestant_member_id) ?? [];
                    return (
                <div key={r.contestant_member_id} className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {showRanking && (
                      <span className="shrink-0 w-8 h-8 rounded-full bg-maroon-700 text-white flex items-center justify-center text-sm font-black">
                        {r.rank ?? '—'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">TM {nameOf(r.contestant_member_id)}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{r.judge_count} judge{r.judge_count === 1 ? '' : 's'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{Number(r.final_score)}<span className="text-xs font-medium text-slate-400"> / {RUBRIC_TOTAL}</span></p>
                    </div>
                  </div>

                  <div className="px-4 pb-3 flex items-center gap-4">
                    <button onClick={() => setExpanded(isOpen ? null : r.contestant_member_id)}
                      className="text-xs font-semibold text-maroon-600 dark:text-maroon-400">
                      {isOpen ? 'Hide breakdown' : 'Show breakdown'}
                    </button>
                    {isAdmin ? (
                      <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
                        <input type="checkbox" checked={r.revealed} onChange={(e) => toggleReveal(r.contestant_member_id, e.target.checked)}
                          className="w-4 h-4 accent-maroon-700 rounded" />
                        <span className="text-xs text-slate-500 dark:text-slate-400">Revealed to contestant</span>
                      </label>
                    ) : r.revealed ? (
                      <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Revealed ✓</span>
                    ) : null}
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 space-y-3">
                      {/* Per-item averages */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Averages</p>
                        <div className="space-y-1">
                          {CONTEST_RUBRIC.map((item) => (
                            <div key={item.key} className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
                              <span className="tabular-nums text-slate-800 dark:text-slate-100">{r.item_avgs?.[item.key] ?? 0} <span className="text-slate-400 text-xs">/ {item.max}</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Individual judge scores — admin-only transparency */}
                      {isAdmin && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Individual judges</p>
                          <div className="space-y-1">
                            {judgeBallots.length === 0 && <p className="text-xs text-slate-400">No ballots yet.</p>}
                            {judgeBallots.map((b) => (
                              <div key={b.id} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-300">TM {nameOf(b.judge_member_id)}</span>
                                <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{b.total} / {RUBRIC_TOTAL}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 text-slate-500 dark:text-slate-400">
      <div>{children}</div>
    </div>
  );
}
