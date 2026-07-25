'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { useIdentity } from '@/hooks/useIdentity';
import type { JuryScore, Member, MeetingWithClaims } from '@/lib/types';
import { isClubOfficer } from '@/lib/types';
import { formatMeetingDate, speakerBuckets, groupIdForSlot, hasSpeakerGroups } from '@/lib/utils';
import { CONTEST_RUBRIC, RUBRIC_TOTAL, scoreTotal } from '@/lib/contest';

interface Judge { id: string; name: string }
interface Candidate { slot: number; id: string; name: string; groupName: string | null }

export default function ScorecardsPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { memberId, loaded } = useIdentity();
  const supabase = createClient();

  const [me, setMe] = useState<Member | null>(null);
  const [meeting, setMeeting] = useState<MeetingWithClaims | null>(null);
  const [scores, setScores] = useState<JuryScore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [{ data: mtg }, { data: sc }, { data: mem }] = await Promise.all([
      supabase.from('meetings').select('*, role_claims(*, member:members(*))').eq('id', meetingId).single(),
      supabase.from('jury_scores').select('*').eq('meeting_id', meetingId),
      supabase.from('members').select('*'),
    ]);
    setMeeting((mtg as MeetingWithClaims) ?? null);
    setScores((sc as JuryScore[]) ?? []);
    setMembers((mem as Member[]) ?? []);
  }, [meetingId, supabase]);

  useEffect(() => {
    if (!memberId || memberId === 'guest') { setLoading(false); return; }
    supabase.from('members').select('*').eq('id', memberId).single().then(({ data }) => setMe((data as Member) ?? null));
  }, [memberId, supabase]);

  useEffect(() => {
    if (!loaded) return;
    loadAll().finally(() => setLoading(false));
  }, [loaded, loadAll]);

  const isAdmin = !!me && (me.is_admin || isClubOfficer(me));

  if (!loaded || loading) return <Centered>Loading…</Centered>;
  if (!meeting) return <Centered>Meeting not found.</Centered>;
  if (!isAdmin) return <Centered>Admins only.</Centered>;

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—';

  // Judges (jury), in slot order.
  const judges: Judge[] = meeting.role_claims
    .filter((c) => c.role_key === 'jury' && c.member_id)
    .sort((a, b) => a.slot_index - b.slot_index)
    .map((c) => ({ id: c.member_id, name: nameOf(c.member_id) }));

  // Candidates by heat / speaking order.
  const grouped = hasSpeakerGroups(meeting);
  const claimBySlot = new Map(meeting.role_claims.filter((c) => c.role_key === 'speaker').map((c) => [c.slot_index, c]));
  const candidates: Candidate[] = [];
  for (const bucket of speakerBuckets(meeting)) {
    for (const slot of bucket.slots) {
      const claim = claimBySlot.get(slot);
      if (!claim?.member_id) continue;
      candidates.push({ slot, id: claim.member_id, name: nameOf(claim.member_id), groupName: bucket.group?.name ?? null });
    }
  }

  const scoreFor = (judgeId: string, candidateId: string): JuryScore | undefined =>
    scores.find((s) => s.judge_member_id === judgeId && s.contestant_member_id === candidateId);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href={`/contest/${meeting.id}`} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">← Results</Link>

        <div className="mt-4 mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Speech Contest · Judge Scorecards</p>
          <h1 className="font-serif text-2xl font-black text-slate-900 dark:text-white">Meeting #{meeting.number}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{formatMeetingDate(meeting.date)} · {judges.length} judge{judges.length === 1 ? '' : 's'}</p>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-400">No contestants yet.</p>
        ) : judges.length === 0 ? (
          <p className="text-sm text-slate-400">No jury assigned yet.</p>
        ) : (
          <div className="space-y-8">
            {candidates.map((cand) => {
              const cScores = judges.map((j) => scoreFor(j.id, cand.id));
              return (
                <div key={cand.id}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h2 className="text-base font-black text-slate-900 dark:text-white">TM {cand.name}</h2>
                    {cand.groupName && (
                      <span className="text-[11px] font-bold text-maroon-700 dark:text-maroon-400">{cand.groupName}</span>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/70">
                          <th className="text-left font-bold text-slate-700 dark:text-slate-200 px-3 py-2 sticky left-0 bg-slate-100 dark:bg-slate-800/70 min-w-[150px]">Criterion</th>
                          {judges.map((j) => (
                            <th key={j.id} className="text-center font-bold text-slate-700 dark:text-slate-200 px-2 py-2 whitespace-nowrap">TM {j.name}</th>
                          ))}
                          <th className="text-center font-bold text-maroon-700 dark:text-maroon-400 px-2 py-2">Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CONTEST_RUBRIC.map((item) => {
                          const vals = cScores.map((s) => (s ? Number(s.scores?.[item.key]) : null));
                          const present = vals.filter((v): v is number => v != null && !Number.isNaN(v));
                          const avg = present.length ? round1(present.reduce((a, b) => a + b, 0) / present.length) : null;
                          return (
                            <tr key={item.key} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-slate-900">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
                                <span className="text-slate-400 dark:text-slate-500 text-xs"> /{item.max}</span>
                              </td>
                              {vals.map((v, i) => (
                                <td key={i} className="text-center px-2 py-1.5 tabular-nums text-slate-700 dark:text-slate-200">
                                  {v == null || Number.isNaN(v) ? <span className="text-slate-300 dark:text-slate-600">—</span> : v}
                                </td>
                              ))}
                              <td className="text-center px-2 py-1.5 tabular-nums font-semibold text-maroon-700 dark:text-maroon-400">
                                {avg == null ? '—' : avg}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                          <td className="px-3 py-2 sticky left-0 bg-slate-50 dark:bg-slate-800/40 font-black text-slate-900 dark:text-white">Total /{RUBRIC_TOTAL}</td>
                          {cScores.map((s, i) => (
                            <td key={i} className="text-center px-2 py-2 tabular-nums font-black text-slate-900 dark:text-white">
                              {s ? (s.total ?? scoreTotal(s.scores)) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                          ))}
                          <td className="text-center px-2 py-2 tabular-nums font-black text-maroon-700 dark:text-maroon-400">
                            {(() => {
                              const totals = cScores.filter((s): s is JuryScore => !!s).map((s) => s.total ?? scoreTotal(s.scores));
                              return totals.length ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : '—';
                            })()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
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
