'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { useIdentity } from '@/hooks/useIdentity';
import type { JuryScore, Member, MeetingWithClaims, RoleClaim } from '@/lib/types';
import { formatMeetingDate, speakerBuckets } from '@/lib/utils';
import { CONTEST_RUBRIC, RUBRIC_CATEGORIES, RUBRIC_TOTAL } from '@/lib/contest';
import { ContestBallot } from '@/components/ContestBallot';

interface Contestant { slot: number; member: Member; claim: RoleClaim }

// "Path · L3 · Project name" — whichever speech details the speaker has filled.
function speechMeta(claim: RoleClaim): string {
  return [claim.path, claim.speech_level ? `L${claim.speech_level}` : null, claim.project]
    .filter(Boolean).join(' · ');
}

export default function JudgePage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { memberId, loaded } = useIdentity();
  const supabase = createClient();

  const [meeting, setMeeting] = useState<MeetingWithClaims | null>(null);
  const [myScores, setMyScores] = useState<JuryScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  const loadMeeting = useCallback(() => {
    return supabase
      .from('meetings')
      .select('*, role_claims(*, member:members(*))')
      .eq('id', meetingId)
      .single()
      .then(({ data }) => setMeeting((data as MeetingWithClaims) ?? null));
  }, [meetingId, supabase]);

  const loadScores = useCallback(() => {
    if (!memberId || memberId === 'guest') return Promise.resolve();
    return supabase
      .from('jury_scores')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('judge_member_id', memberId)
      .then(({ data }) => setMyScores((data as JuryScore[]) ?? []));
  }, [meetingId, memberId, supabase]);

  useEffect(() => {
    if (!loaded) return;
    Promise.all([loadMeeting(), loadScores()]).finally(() => setLoading(false));
  }, [loaded, loadMeeting, loadScores]);

  if (!loaded || loading) {
    return <Centered>Loading…</Centered>;
  }

  if (!memberId || memberId === 'guest') {
    return (
      <Centered>
        <p className="mb-3">Please sign in as a member to judge.</p>
        <Link href="/" className="text-maroon-600 dark:text-maroon-400 font-semibold">Open the app →</Link>
      </Centered>
    );
  }

  if (!meeting) return <Centered>Meeting not found.</Centered>;

  const isJudge = meeting.role_claims.some((c) => c.role_key === 'jury' && c.member_id === memberId);
  if (!isJudge) {
    return (
      <Centered>
        <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">You’re not a judge for this meeting.</p>
        <p className="text-sm text-slate-400">Only members assigned to the jury can score contestants.</p>
      </Centered>
    );
  }

  // Contestants keyed by speaker slot (only claimed slots within the current count).
  const bySlot = new Map<number, Contestant>();
  for (const c of meeting.role_claims) {
    if (c.role_key === 'speaker' && c.member && c.slot_index <= meeting.speaker_slots) {
      bySlot.set(c.slot_index, { slot: c.slot_index, member: c.member as Member, claim: c });
    }
  }

  // Arrange by group (heat) and speaking order, numbering speakers per group.
  const hasGroups = (meeting.speaker_groups?.length ?? 0) > 0;
  const buckets = speakerBuckets(meeting)
    .map((b) => ({ group: b.group, items: b.slots.map((s) => bySlot.get(s)).filter((c): c is Contestant => !!c) }))
    .filter((b) => b.items.length > 0);
  const contestants = buckets.flatMap((b) => b.items);

  const scoredIds = new Set(myScores.map((s) => s.contestant_member_id));
  const selected = contestants.find((c) => c.member.id === selectedId) ?? null;
  const existingForSelected = selected ? myScores.find((s) => s.contestant_member_id === selected.member.id) ?? null : null;

  async function handleSaved() {
    await loadScores();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">← Back to app</Link>
          <Link href={`/contest/${meeting.id}`} className="text-sm font-semibold text-maroon-600 dark:text-maroon-400 hover:text-maroon-800 dark:hover:text-maroon-300 transition-colors">🏆 View results →</Link>
        </div>

        <div className="mt-4 mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Speech Contest · Judge’s Ballot</p>
          <h1 className="font-serif text-2xl font-black text-slate-900 dark:text-white">Meeting #{meeting.number}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{formatMeetingDate(meeting.date)}</p>
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {scoredIds.size} / {contestants.length} contestants scored
          </p>
        </div>

        {meeting.contest_locked && (
          <div className="mb-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 px-4 py-3">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">🔒 Scoring is locked by the admin — ballots are final and can no longer be edited.</p>
          </div>
        )}

        <ScoringGuide />

        {contestants.length === 0 ? (
          <p className="text-sm text-slate-400 mt-5">No prepared speakers to judge yet.</p>
        ) : (
          <div className="mt-5">
            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Select a contestant</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm
                           bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                           focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500"
              >
                <option value="">Choose a speaker…</option>
                {buckets.map((b, bi) => {
                  const opts = b.items.map((c, i) => (
                    <option key={c.member.id} value={c.member.id}>
                      Speaker {i + 1} — TM {c.member.display_name}{scoredIds.has(c.member.id) ? '  ✓ scored' : ''}
                    </option>
                  ));
                  return hasGroups
                    ? <optgroup key={bi} label={b.group ? b.group.name : 'Unassigned'}>{opts}</optgroup>
                    : opts;
                })}
              </select>
            </label>

            {selected ? (
              <ContestBallot
                key={selected.member.id}
                meetingId={meeting.id}
                judgeMemberId={memberId}
                contestant={selected.member}
                claim={selected.claim}
                existing={existingForSelected}
                locked={meeting.contest_locked}
                onSaved={handleSaved}
              />
            ) : (
              <div className="space-y-4">
                {buckets.map((b, bi) => (
                  <div key={bi}>
                    {hasGroups && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                          {b.group ? b.group.name : 'Unassigned'}
                        </span>
                        <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                      </div>
                    )}
                    <div className="space-y-2">
                      {b.items.map((c, i) => {
                        const meta = speechMeta(c.claim);
                        return (
                          <button
                            key={c.member.id}
                            onClick={() => setSelectedId(c.member.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-colors
                                       border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900
                                       hover:border-maroon-300 dark:hover:border-maroon-700"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                                <span className="text-slate-400 dark:text-slate-500 font-normal">Speaker {i + 1} · </span>
                                TM {c.member.display_name}
                              </span>
                              {c.claim.speech_title && (
                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">“{c.claim.speech_title}”</span>
                              )}
                              {meta && (
                                <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{meta}</span>
                              )}
                            </span>
                            {scoredIds.has(c.member.id)
                              ? <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Scored</span>
                              : <span className="shrink-0 text-xs text-maroon-600 dark:text-maroon-400">Score →</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

// Collapsible reference: the 100-point rubric and its suggested point bands,
// straight from the International Speech Contest ballot.
function ScoringGuide() {
  return (
    <details className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <span>📖</span> Scoring guide
        <span className="ml-auto text-xs font-normal text-slate-600 dark:text-slate-400">{RUBRIC_TOTAL} points total</span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-800 dark:text-slate-200 mb-3 leading-relaxed">
          Award each item a whole-number score up to its maximum. Use the bands as a guide —
          Excellent, Very good, Good, Fair.
        </p>
        {RUBRIC_CATEGORIES.map((cat) => (
          <div key={cat.name} className="mb-3 last:mb-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-maroon-700 dark:text-maroon-400 mb-1.5">
              {cat.name} · {cat.max}%
            </p>
            <div className="space-y-2">
              {CONTEST_RUBRIC.filter((i) => i.category === cat.name).map((item) => (
                <div key={item.key} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{item.label}</span>
                    <span className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">max {item.max}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{item.desc}</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    Excellent {item.bands.excellent} · Very good {item.bands.veryGood} · Good {item.bands.good} · Fair {item.bands.fair}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
