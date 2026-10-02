'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Ballot, MeetingWithClaims, SpeakerRatingResult } from '@/lib/types';
import { SPEAKER_RATING_SCALE, speakerScore } from '@/lib/types';
import { claimHolderName, ordinalRank, rankSpeakerRatings } from '@/lib/utils';

interface Props {
  ballot: Ballot;
  meeting: MeetingWithClaims;
  memberId: string | null;
  deviceId: string | null;
  isAdmin?: boolean;
  onClose: () => void;
}

// Speakathon ballot (ballot_mode = 'speaker_rating'). The admin points the
// ballot at one speaker at a time (ballots.active_speaker_slot); this modal
// follows along through the realtime ballot updates MeetingCard passes down,
// so a voter can leave it open for the whole session and rate each speaker
// as their round opens.
export function SpeakerRatingModal({ ballot, meeting, memberId, deviceId, isAdmin, onClose }: Props) {
  const supabase = createClient();
  const isClosed = ballot.status === 'closed';
  const activeSlot = ballot.active_speaker_slot ?? null;

  const activeClaim = activeSlot !== null
    ? meeting.role_claims.find(c => c.role_key === 'speaker' && c.slot_index === activeSlot) ?? null
    : null;
  const activeName = activeClaim ? (claimHolderName(activeClaim, activeClaim.member ?? null) ?? `Speaker ${activeSlot}`) : `Speaker ${activeSlot}`;

  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Slots this device/member has rated during this session — a cheap local
  // cache so the "recorded" state shows instantly; has_rated_speaker is the
  // source of truth for a reopened modal or a second device.
  const [ratedSlots, setRatedSlots] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(false);

  const [results, setResults] = useState<SpeakerRatingResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(isClosed);

  useEffect(() => {
    if (!isClosed) return;
    supabase.rpc('get_speaker_rating_results', { p_ballot_id: ballot.id }).then(({ data }) => {
      if (data) setResults(data as SpeakerRatingResult[]);
      setLoadingResults(false);
    });
  }, [ballot.id, isClosed]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new speaker's round: clear the picked score and check whether this
  // voter already rated them (e.g. from another device).
  useEffect(() => {
    setScore(null);
    setSubmitError('');
    if (isClosed || activeSlot === null || !deviceId) return;
    setChecking(true);
    supabase.rpc('has_rated_speaker', {
      p_ballot_id: ballot.id,
      p_speaker_slot: activeSlot,
      p_device_uuid: deviceId,
      p_member_id: memberId && memberId !== 'guest' ? memberId : null,
    }).then(({ data }) => {
      if (data) setRatedSlots(s => new Set(s).add(activeSlot));
      setChecking(false);
    });
  }, [ballot.id, activeSlot, isClosed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same eligibility gates as the awards ballot (set by the admin when opening).
  const isGuestVoter = memberId === 'guest';
  const guestVotingOff = isGuestVoter && ballot.allow_guest_voting === false;
  const notOnVoterList = !isGuestVoter && ballot.voter_restriction === 'selected'
    && !!memberId && !(ballot.allowed_voter_ids ?? []).includes(memberId);
  const notEligible = guestVotingOff || notOnVoterList;
  const isOwnSpeech = !!memberId && memberId !== 'guest' && activeClaim?.member_id === memberId;
  const alreadyRated = activeSlot !== null && ratedSlots.has(activeSlot);

  async function handleSubmit() {
    if (score === null || activeSlot === null || submitting || !memberId || !deviceId || notEligible || isOwnSpeech) return;
    setSubmitting(true);
    setSubmitError('');
    const { error } = await supabase.from('speaker_ratings').insert({
      ballot_id: ballot.id,
      speaker_slot: activeSlot,
      device_uuid: deviceId,
      voter_member_id: memberId === 'guest' ? null : memberId,
      voted_for_member_id: activeClaim?.member_id ?? null,
      voted_for_name: activeClaim?.guest_name ?? null,
      score,
    });
    if (!error || error.code === '23505') {
      setRatedSlots(s => new Set(s).add(activeSlot));
    } else if (error.code === '42501') {
      // RLS rejected it — the admin moved on (or closed) between pick and submit.
      setSubmitError("This speaker's rating round has just closed.");
    } else {
      setSubmitError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  const speechTitle = activeClaim?.speech_title?.trim();
  const ranked = rankSpeakerRatings(results);
  const myResult = memberId && memberId !== 'guest' ? ranked.find(r => r.voted_for_member_id === memberId) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-modal-dark max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: isClosed
            ? 'linear-gradient(135deg, #0E2D6A 0%, #071b50 100%)'
            : 'linear-gradient(135deg, #9d1530 0%, #C41E3A 100%)' }}
        >
          <div>
            <h2 className="font-bold text-white text-lg">
              Meeting #{meeting.number} — {isClosed ? 'Speaker Ratings' : 'Rate the Speaker'}
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              {isClosed ? 'Final results' : 'Score each speech from 1 to 10'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {isClosed && (
            <>
              {loadingResults && (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">Loading results…</div>
              )}
              {!loadingResults && results.length === 0 && (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No ratings were cast.</div>
              )}
              {!loadingResults && myResult && (
                <div className="rounded-xl bg-gradient-to-r from-maroon-700 to-maroon-600 text-white px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Your rank</p>
                    <p className="text-xl font-black">{ordinalRank(myResult.rank)} <span className="text-sm font-medium text-white/70">of {ranked.length}</span></p>
                  </div>
                  <p className="text-2xl font-black tabular-nums">{speakerScore(myResult).toFixed(1)}<span className="text-sm font-medium text-white/70"> / 10</span></p>
                </div>
              )}
              {!loadingResults && ranked.some(r => Number(r.estimated_count) > 0) && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
                  Scores are adjusted for missed votes, so every speaker is judged by the same panel.
                </p>
              )}
              {!loadingResults && ranked.length > 0 && (
                <div className="space-y-1.5">
                  {ranked.map((r) => {
                    const isMe = !!memberId && r.voted_for_member_id === memberId;
                    return (
                    <div key={`${r.speaker_slot}-${r.voted_for_member_id ?? r.voted_for_display_name}`}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                        r.rank === 1
                          ? 'bg-gold-50 dark:bg-gold-950/20 border-gold-200 dark:border-gold-800/40'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700/50'
                      } ${isMe ? 'ring-2 ring-maroon-500' : ''}`}>
                      <span className="text-base shrink-0 w-8 text-center">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : <span className="text-xs font-semibold text-slate-400">{ordinalRank(r.rank)}</span>}</span>
                      <span className={`text-sm flex-1 font-medium ${r.rank === 1 ? 'text-amber-800 dark:text-gold-300' : 'text-slate-600 dark:text-slate-300'}`}>
                        {r.voted_for_display_name}{isMe && <span className="ml-1.5 text-[10px] font-bold uppercase text-maroon-600 dark:text-maroon-400">You</span>}
                      </span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">{speakerScore(r).toFixed(1)}<span className="text-[10px] font-medium text-slate-400"> /10</span></span>
                      {isAdmin && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                          {r.rating_count}{Number(r.estimated_count) > 0 ? ` + ${r.estimated_count} est.` : ''}
                        </span>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!isClosed && notEligible && (
            <div className="text-center py-8 space-y-2">
              <div className="text-4xl">🚫</div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">You can&apos;t vote in this ballot</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {guestVotingOff
                  ? 'Guest voting is switched off for this meeting — please sign in to vote.'
                  : "You're not on the voter list for this ballot."}
              </p>
            </div>
          )}

          {!isClosed && !notEligible && activeSlot === null && (
            <div className="text-center py-8 space-y-2">
              <div className="text-4xl">⏳</div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">Waiting for the next speaker</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Keep this open — rating opens here as soon as the admin starts the next speaker&apos;s round.
              </p>
            </div>
          )}

          {!isClosed && !notEligible && activeSlot !== null && (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Now rating</p>
                <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">{activeName}</p>
                {speechTitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">&ldquo;{speechTitle}&rdquo;</p>}
              </div>

              {isOwnSpeech ? (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl">🎙️</div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">This is your speech</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">You can&apos;t rate yourself — you&apos;ll rate the next speaker.</p>
                </div>
              ) : alreadyRated ? (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl">✓</div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Rating recorded</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">Waiting for the next speaker. Results are revealed when voting closes.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-5 gap-2">
                    {SPEAKER_RATING_SCALE.map(n => (
                      <button
                        key={n}
                        onClick={() => setScore(n)}
                        disabled={checking}
                        className={`aspect-square rounded-xl text-lg font-bold border transition-all disabled:opacity-40
                          ${score === n
                            ? 'bg-gradient-to-br from-maroon-700 to-maroon-600 text-white border-maroon-700 scale-105'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/50 hover:border-maroon-300 dark:hover:border-maroon-700'
                          }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 -mt-3 px-1">
                    <span>1 · Needs work</span>
                    <span>10 · Outstanding</span>
                  </div>

                  {submitError && <p className="text-sm text-red-500">{submitError}</p>}

                  <button
                    onClick={handleSubmit}
                    disabled={score === null || submitting || checking}
                    className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                               text-white py-3.5 rounded-xl font-semibold text-base
                               disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {submitting ? 'Submitting…' : score === null ? 'Pick a score' : `Submit ${score} / 10`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
