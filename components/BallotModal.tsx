'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Ballot, MeetingWithClaims, Member, VoteResult } from '@/lib/types';
import { ROLE_META } from '@/lib/types';
import type { RoleClaim, RoleKey } from '@/lib/types';
import { claimHolderName } from '@/lib/utils';

interface Props {
  ballot: Ballot;
  meeting: MeetingWithClaims;
  allMembers: Member[];
  memberId: string | null;
  deviceId: string | null;
  isAdmin?: boolean;
  onClose: () => void;
}

interface Candidate {
  id: string;
  label: string;
  memberId: string | null;
  guestName: string | null;
}

type VoteCategory = 'speaker' | 'evaluator' | 'table_topics' | 'role_player' | 'aux_role';

const CAT_META: Record<VoteCategory, { label: string; emoji: string }> = {
  speaker:      { label: 'Best Speaker',               emoji: '🎙️' },
  evaluator:    { label: 'Best Evaluator',              emoji: '⚖️' },
  table_topics: { label: 'Best Table Topics Speaker',   emoji: '💬' },
  role_player:  { label: 'Best Role Player',            emoji: '🎤' },
  aux_role:     { label: 'Best Auxiliary Role Player',  emoji: '⏱️' },
};

const ROLE_PLAYER_KEYS: RoleKey[] = ['tmod', 'ge', 'ttm'];
const AUX_ROLE_KEYS:    RoleKey[] = ['timer', 'grammarian', 'ah_counter', 'harkmaster'];

export function BallotModal({ ballot, meeting, allMembers, memberId, deviceId, isAdmin, onClose }: Props) {
  const supabase = createClient();
  const isClosed = ballot.status === 'closed';

  const [results, setResults] = useState<VoteResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(isClosed);

  useEffect(() => {
    if (!isClosed) return;
    supabase.rpc('get_ballot_results', { p_ballot_id: ballot.id }).then(({ data }) => {
      if (data) setResults(data as VoteResult[]);
      setLoadingResults(false);
    });
  }, [ballot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [voteCount, setVoteCount] = useState<number | null>(null);

  const fetchVoteCount = useCallback(async () => {
    const { data } = await supabase.rpc('get_vote_count', { p_ballot_id: ballot.id });
    setVoteCount(data ?? 0);
  }, [ballot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isClosed) return;
    if (deviceId) {
      supabase.rpc('has_voted', { p_ballot_id: ballot.id, p_device_uuid: deviceId })
        .then(({ data }) => { if (data) setAlreadyVoted(true); });
    }
    if (ballot.voter_count) fetchVoteCount();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ballot.voter_count !== null && voteCount !== null && voteCount >= ballot.voter_count) setIsFull(true);
  }, [voteCount, ballot.voter_count]);

  useEffect(() => {
    if (!submitted && !alreadyVoted) return;
    fetchVoteCount();
    const id = setInterval(fetchVoteCount, 10_000);
    return () => clearInterval(id);
  }, [submitted, alreadyVoted, fetchVoteCount]);

  // A role can be held by a member or by an admin-named guest; votes already
  // carry either a member id or a bare name, so both are votable. The claim's
  // own id is the selection key — a guest has no member id to use.
  const claimCandidate = (c: RoleClaim, suffix = ''): Candidate => ({
    id: c.id,
    label: (claimHolderName(c, c.member ?? null) ?? 'TM ?') + suffix,
    memberId: c.member_id,
    guestName: c.guest_name,
  });

  const speakerCandidates: Candidate[] = meeting.role_claims
    .filter(c => c.role_key === 'speaker')
    .map(c => claimCandidate(c));

  const evaluatorCandidates: Candidate[] = meeting.role_claims
    .filter(c => c.role_key === 'evaluator')
    .map(c => claimCandidate(c));

  const ttCandidates: Candidate[] = ballot.table_topics_speakers.map(s => ({
    id: s.id,
    label: s.is_guest ? `${s.name} (Guest)` : `TM ${s.name}`,
    memberId: s.is_guest ? null : s.id,
    guestName: s.is_guest ? s.name : null,
  }));

  const roleCandidates: Candidate[] = ROLE_PLAYER_KEYS.flatMap(roleKey =>
    meeting.role_claims.filter(c => c.role_key === roleKey)
      .map(c => claimCandidate(c, ` · ${ROLE_META[roleKey].label}`))
  );

  const auxCandidates: Candidate[] = AUX_ROLE_KEYS.flatMap(roleKey =>
    meeting.role_claims.filter(c => c.role_key === roleKey)
      .map(c => claimCandidate(c, ` · ${ROLE_META[roleKey].label}`))
  );

  const categories: { key: VoteCategory; candidates: Candidate[] }[] = ([
    { key: 'speaker'      as VoteCategory, candidates: speakerCandidates },
    { key: 'evaluator'    as VoteCategory, candidates: evaluatorCandidates },
    { key: 'table_topics' as VoteCategory, candidates: ttCandidates },
    { key: 'role_player'  as VoteCategory, candidates: roleCandidates },
    { key: 'aux_role'     as VoteCategory, candidates: auxCandidates },
  ] as { key: VoteCategory; candidates: Candidate[] }[]).filter(c => c.candidates.length > 0);

  const allSelected = categories.every(c => !!selections[c.key]);

  async function handleSubmit() {
    if (!allSelected || submitting || !memberId || !deviceId) return;
    setSubmitting(true);
    setSubmitError('');

    if (ballot.voter_count !== null) {
      const { data: currentCount } = await supabase.rpc('get_vote_count', { p_ballot_id: ballot.id });
      if (currentCount !== null && Number(currentCount) >= ballot.voter_count) {
        setIsFull(true);
        setSubmitError(`Voting is full — all ${ballot.voter_count} slots are taken.`);
        setSubmitting(false);
        return;
      }
    }

    const rows = categories.map(c => {
      const candidate = c.candidates.find(cand => cand.id === selections[c.key])!;
      return {
        ballot_id: ballot.id,
        device_uuid: deviceId,
        voter_member_id: memberId === 'guest' ? null : memberId,
        category: c.key,
        voted_for_member_id: candidate.memberId ?? null,
        voted_for_name: candidate.guestName ?? null,
      };
    });

    const { error } = await supabase.from('votes').insert(rows);
    if (error) {
      if (error.code === '23505') setAlreadyVoted(true);
      else setSubmitError('Something went wrong. Please try again.');
    } else {
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  function voteCountLabel(count: number) {
    return ballot.voter_count
      ? `${count} / ${ballot.voter_count} votes`
      : `${count} ${count === 1 ? 'vote' : 'votes'} submitted`;
  }

  const CAT_LABELS: Record<string, string> = {
    speaker:      '🎙️ Best Speaker',
    evaluator:    '⚖️ Best Evaluator',
    table_topics: '💬 Best Table Topics Speaker',
    role_player:  '🎤 Best Role Player',
    aux_role:     '⏱️ Best Auxiliary Role Player',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-modal-dark max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: isClosed
            ? 'linear-gradient(135deg, #0E2D6A 0%, #071b50 100%)'
            : 'linear-gradient(135deg, #9d1530 0%, #C41E3A 100%)' }}
        >
          <div>
            <h2 className="font-bold text-white text-lg">
              Meeting #{meeting.number} — {isClosed ? 'Results' : 'Ballot'}
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              {isClosed ? 'Final results' : 'Select one in each category, then submit'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">

          {/* Results view */}
          {isClosed && (
            <>
              {loadingResults && (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">Loading results…</div>
              )}
              {!loadingResults && results.length === 0 && (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No votes were cast.</div>
              )}
              {!loadingResults && Object.entries(CAT_LABELS).map(([cat, label]) => {
                const catRows = results.filter(r => r.category === cat);
                if (!catRows.length) return null;
                return (
                  <div key={cat}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{label}</p>
                    <div className="space-y-1.5">
                      {catRows.map((r, i) => (
                        <div key={`${r.voted_for_member_id ?? r.voted_for_display_name}-${i}`}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                            i === 0
                              ? 'bg-gold-50 dark:bg-gold-950/20 border-gold-200 dark:border-gold-800/40'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700/50'
                          }`}>
                          <span className="text-base shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          <span className={`text-sm flex-1 font-medium ${i === 0 ? 'text-amber-800 dark:text-gold-300' : 'text-slate-600 dark:text-slate-300'}`}>
                            {r.voted_for_display_name}
                          </span>
                          {isAdmin && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                              {r.vote_count} vote{r.vote_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Voting mode */}
          {!isClosed && (
            <>
              {isFull && !submitted && !alreadyVoted && (
                <div className="text-center py-8 space-y-2">
                  <div className="text-4xl">🚫</div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Voting slots are full</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">All {ballot.voter_count} voting slots have been taken.</p>
                </div>
              )}

              {alreadyVoted && (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl">✓</div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Your vote is already recorded</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">Results revealed when voting closes.</p>
                  {voteCount !== null && (
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{voteCountLabel(voteCount)}</p>
                  )}
                </div>
              )}

              {submitted && !alreadyVoted && (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl">✓</div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Vote submitted!</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">Results revealed when voting closes.</p>
                  {voteCount !== null && (
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{voteCountLabel(voteCount)}</p>
                  )}
                </div>
              )}

              {!isFull && !submitted && !alreadyVoted && (
                <>
                  {categories.map(cat => {
                    const meta = CAT_META[cat.key];
                    return (
                      <div key={cat.key}>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                          {meta.emoji} {meta.label}
                        </p>
                        <div className="space-y-1.5">
                          {cat.candidates.map(c => (
                            <button
                              key={c.id}
                              onClick={() => setSelections(s => ({ ...s, [cat.key]: c.id }))}
                              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all border
                                ${selections[cat.key] === c.id
                                  ? 'bg-gradient-to-r from-maroon-700 to-maroon-600 text-white border-maroon-700'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-100 dark:border-slate-700/50 hover:border-maroon-300 dark:hover:border-maroon-700 hover:bg-maroon-50 dark:hover:bg-maroon-950/20'
                                }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {submitError && <p className="text-sm text-red-500">{submitError}</p>}

                  <button
                    onClick={handleSubmit}
                    disabled={!allSelected || submitting}
                    className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                               text-white py-3.5 rounded-xl font-semibold text-base
                               disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {submitting ? 'Submitting…' : 'Submit Ballot'}
                  </button>
                  {!allSelected && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center -mt-4">
                      Select one per category to enable submit
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
