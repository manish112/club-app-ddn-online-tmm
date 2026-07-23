'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Ballot, EvaluatorRequest, MeetingWithClaims, Member, RoleKey, SpeakerGroup, SpeakerSlotRequest } from '@/lib/types';
import { getMeetingRoles, isRoleEnabled } from '@/lib/types';
import { formatTime, isMeetingLocked, isMeetingPast, getMeetingLockTimeIST, speakerBuckets, groupIdForSlot, orderedSpeakerSlots, hasSpeakerGroups } from '@/lib/utils';
import { RoleSlot } from './RoleSlot';
import { WhatsAppCopyButton } from './WhatsAppCopyButton';
import { BallotModal } from './BallotModal';
import { AgendaModal } from './AgendaModal';

interface Props {
  meeting: MeetingWithClaims;
  allMembers: Member[];
  memberId: string | null;
  memberAdjacentRoles?: RoleKey[];
  deviceId?: string | null;
  ballot?: Ballot;
  isAdmin: boolean;
  hideWhatsApp?: boolean;
  lockBeforeMins?: number;
  maxSpeakerSlots?: number;
  onChanged: () => void;
}

export function MeetingCard({ meeting, allMembers, memberId, memberAdjacentRoles = [], deviceId, ballot, isAdmin, hideWhatsApp, lockBeforeMins = 60, maxSpeakerSlots = 2, onChanged }: Props) {
  const supabase = createClient();
  const [showBallot, setShowBallot] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const [themeInput, setThemeInput] = useState(meeting.theme ?? '');
  const [savingTheme, setSavingTheme] = useState(false);
  const [slotRequest, setSlotRequest] = useState<SpeakerSlotRequest | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [requestEvaluatorId, setRequestEvaluatorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const locked = isMeetingLocked(meeting, lockBeforeMins);
  const past   = isMeetingPast(meeting);

  useEffect(() => {
    if (!memberId || memberId === 'guest') return;
    supabase.from('speaker_slot_requests')
      .select('*').eq('meeting_id', meeting.id).eq('member_id', memberId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data?.status === 'pending' && locked) {
          await supabase.from('speaker_slot_requests').update({
            status: 'denied',
            review_comment: 'Meeting locked — request could not be processed in time.',
            reviewed_at: new Date().toISOString(),
          }).eq('id', data.id);
          setSlotRequest({ ...data, status: 'denied', review_comment: 'Meeting locked — request could not be processed in time.' });
        } else {
          setSlotRequest(data ?? null);
        }
      });
  }, [meeting.id, memberId, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitRequest() {
    if (!memberId || memberId === 'guest') return;
    setSubmitting(true);
    const { data } = await supabase.from('speaker_slot_requests')
      .insert({
        meeting_id: meeting.id,
        member_id: memberId,
        request_note: requestNote.trim() || null,
        preferred_evaluator_id: requestEvaluatorId || null,
      })
      .select().single();
    // Record the evaluator nomination right away (with an unbound slot) so it's
    // visible on the requester's dashboard and can be approved/denied on its own.
    // The slot is bound when the extra speaker slot is approved.
    if (data && requestEvaluatorId) {
      // One pending nomination per speaker: retire any earlier one first.
      await supabase.from('evaluator_requests')
        .update({ status: 'cancelled' })
        .eq('meeting_id', meeting.id).eq('speaker_id', memberId).eq('status', 'pending');
      await supabase.from('evaluator_requests').insert({
        meeting_id: meeting.id,
        speaker_slot_index: null,
        speaker_id: memberId,
        preferred_evaluator_id: requestEvaluatorId,
        status: 'pending',
        speaker_slot_request_id: data.id,
      });
      fetch('/api/notify-evaluator-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingNumber: meeting.number,
          meetingDate: meeting.date,
          speakerId: memberId,
          preferredEvaluatorId: requestEvaluatorId,
        }),
      }).catch(() => {});
    }
    setSlotRequest(data ?? null);
    setSubmitting(false);
    setShowRequestForm(false);
    setRequestNote('');
    setRequestEvaluatorId('');
  }
  const isTMoD = !!memberId &&
    meeting.role_claims.some((c) => c.role_key === 'tmod' && c.member_id === memberId);
  // Admins can edit the theme on any meeting (even locked/past); the TMoD can
  // edit their own meeting's theme.
  const canEditTheme = isTMoD || isAdmin;

  async function saveTheme() {
    setSavingTheme(true);
    await supabase.from('meetings').update({ theme: themeInput.trim() || null }).eq('id', meeting.id);
    setSavingTheme(false);
    setEditingTheme(false);
    onChanged();
  }

  const claimsMap = new Map(
    meeting.role_claims.map((c) => [`${c.role_key}:${c.slot_index}`, c])
  );

  // Pending speaker-nominated evaluators, keyed by the paired evaluator slot
  // (evaluator slot i ↔ speaker slot i). A pending request holds that slot.
  const memberNameById = new Map(allMembers.map((m) => [m.id, m.display_name]));
  const pendingEvalBySlot = new Map<number, EvaluatorRequest>();
  for (const r of meeting.evaluator_requests ?? []) {
    if (r.status === 'pending' && r.speaker_slot_index != null) pendingEvalBySlot.set(r.speaker_slot_index, r);
  }
  const pendingEvalName = (slot: number): string | null => {
    const r = pendingEvalBySlot.get(slot);
    if (!r) return null;
    return memberNameById.get(r.preferred_evaluator_id) ?? 'Member';
  };

  // An evaluator slot is gated until its paired speaker slot (same index) is
  // claimed — but only when there's actually a paired speaker slot to wait for.
  const speakerEnabled = isRoleEnabled(meeting, 'speaker');
  const awaitingSpeakerForEval = (slot: number): boolean =>
    speakerEnabled && slot <= meeting.speaker_slots && !claimsMap.has(`speaker:${slot}`);

  // Members already spoken for as evaluators this meeting: those holding an
  // evaluator claim, plus anyone pending as a nominee. They're hidden from the
  // speaker's evaluator picker so the same person can't be nominated twice.
  const unavailableEvaluatorIds: string[] = [
    ...meeting.role_claims.filter((c) => c.role_key === 'evaluator').map((c) => c.member_id),
    ...(meeting.evaluator_requests ?? []).filter((r) => r.status === 'pending').map((r) => r.preferred_evaluator_id),
  ];

  const memberExistingRoles: RoleKey[] = memberId
    ? meeting.role_claims.filter((c) => c.member_id === memberId).map((c) => c.role_key)
    : [];

  const roles = getMeetingRoles(meeting);

  const speakerRoles   = roles.filter((r) => r.roleKey === 'speaker');
  const evaluatorRoles = roles.filter((r) => r.roleKey === 'evaluator');
  const allSpeakerSlotsFull = speakerRoles.length > 0 && speakerRoles.every(({ roleKey, slot }) => claimsMap.has(`${roleKey}:${slot}`));
  const memberHasSpeakerSlot = meeting.role_claims.some(c => c.member_id === memberId && c.role_key === 'speaker');
  // Extra slots are capped: once the meeting is at the admin-set maximum, there's
  // nothing left to request, so the button is hidden.
  const belowSpeakerCap = meeting.speaker_slots < maxSpeakerSlots;
  const canRequestSlot = !past && !locked && allSpeakerSlotsFull && belowSpeakerCap && !memberHasSpeakerSlot && !!memberId && memberId !== 'guest';
  const juryRoles      = roles.filter((r) => r.roleKey === 'jury');
  const mainRoles      = roles.filter((r) => ['tmod', 'ttm', 'ge'].includes(r.roleKey));
  const tagRoles       = roles.filter((r) => ['grammarian', 'ah_counter', 'timer', 'harkmaster'].includes(r.roleKey));
  const evaluatorEnabled = isRoleEnabled(meeting, 'evaluator');
  // Evaluator slots shown inline with a speaker are slots 1..speaker_slots; any
  // beyond that (or all of them, if speakers are disabled) are "extra" and get
  // their own section so they aren't dropped.
  const pairedEvalMax = isRoleEnabled(meeting, 'speaker') ? meeting.speaker_slots : 0;
  const extraEvaluatorRoles = evaluatorRoles.filter(({ slot }) => slot > pairedEvalMax);

  // Speaker groups (heats): when defined, speakers + their paired evaluators are
  // rendered grouped (in speaking order) instead of as two flat grids. Group
  // membership is keyed by the speaker's slot index (speaker i pairs with
  // evaluator i); the speaking order lives in meeting.pair_order.
  const speakerGroups: SpeakerGroup[] = meeting.speaker_groups ?? [];
  const hasGroups = hasSpeakerGroups(meeting);
  const groupBuckets = hasGroups ? speakerBuckets(meeting) : [];

  async function assignPairGroup(slotIndex: number, groupId: string) {
    const next: Record<string, string> = { ...(meeting.pair_groups ?? {}) };
    if (groupId) next[String(slotIndex)] = groupId;
    else delete next[String(slotIndex)];
    await supabase.from('meetings').update({ pair_groups: next }).eq('id', meeting.id);
    onChanged();
  }

  // Move a speaker up/down within its group by swapping it with the nearest
  // same-group neighbour in the global speaking order.
  async function movePair(slotIndex: number, dir: -1 | 1) {
    const gid = groupIdForSlot(meeting, slotIndex);
    const order = orderedSpeakerSlots(meeting);
    const idx = order.indexOf(slotIndex);
    let j = idx + dir;
    while (j >= 0 && j < order.length && groupIdForSlot(meeting, order[j]) !== gid) j += dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    await supabase.from('meetings').update({ pair_order: order }).eq('id', meeting.id);
    onChanged();
  }

  // Date badge parts
  const dateObj   = new Date(meeting.date + 'T00:00:00');
  const dayNum    = dateObj.getDate();
  const monthStr  = dateObj.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
  const weekday   = dateObj.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();

  const slotProps = (roleKey: RoleKey, slot: number) => ({
    meetingId: meeting.id,
    meetingNumber: meeting.number,
    meetingDate: meeting.date,
    roleKey,
    slotIndex: slot,
    claim: claimsMap.get(`${roleKey}:${slot}`) ?? null,
    memberId,
    memberExistingRoles,
    memberAdjacentRoles,
    isLocked: locked,
    isPast: past,
    isAdmin,
    allMembers,
    pendingEvaluatorName: roleKey === 'evaluator' ? pendingEvalName(slot) : null,
    awaitingSpeaker: roleKey === 'evaluator' ? awaitingSpeakerForEval(slot) : false,
    unavailableEvaluatorIds,
    onChanged,
  });

  return (
    <>
    <article className={`rounded-2xl overflow-hidden
      bg-white dark:bg-slate-900
      border border-slate-200 dark:border-slate-700/60
      shadow-card-light dark:shadow-card-dark
      transition-all duration-200
      ${past
        ? 'opacity-70'
        : 'hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_40px_rgba(0,0,0,0.55)]'}`}
    >
      {/* Top accent bar */}
      <div className={`h-[3px] ${past ? 'bg-slate-200 dark:bg-slate-700' : 'shimmer-bar'}`} />

      {/* ── Card Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">

          {/* Calendar date badge */}
          <div className={`shrink-0 w-[52px] rounded-xl text-center overflow-hidden border
            ${past
              ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
              : 'border-maroon-200 dark:border-maroon-800/60 bg-maroon-50 dark:bg-maroon-950/30'}`}>
            <div className={`text-[9px] font-black uppercase tracking-widest py-1 border-b
              ${past
                ? 'bg-slate-100 dark:bg-slate-700/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                : 'bg-maroon-700 dark:bg-maroon-800 border-maroon-600 dark:border-maroon-700 text-white'}`}>
              {monthStr}
            </div>
            <div className={`text-2xl font-black leading-none py-1.5
              ${past ? 'text-slate-500 dark:text-slate-400' : 'text-maroon-700 dark:text-maroon-400'}`}>
              {dayNum}
            </div>
            <div className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 pb-1">
              {weekday}
            </div>
          </div>

          {/* Meeting info */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h2 className="font-serif text-xl font-black text-slate-900 dark:text-white leading-none">
                Meeting #{meeting.number}
              </h2>
              {!isRoleEnabled(meeting, 'ttm') && isRoleEnabled(meeting, 'speaker') && (
                <span className="text-[10px] font-black uppercase tracking-wide
                                 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300
                                 px-2 py-0.5 rounded-full">Speakathon</span>
              )}
              {!isRoleEnabled(meeting, 'speaker') && (
                <span className="text-[10px] font-black uppercase tracking-wide
                                 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300
                                 px-2 py-0.5 rounded-full">Table Topics</span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} IST
            </p>
            {/* Status chips */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {past && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold
                                 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400
                                 px-2 py-0.5 rounded-full">
                  ✓ Past
                </span>
              )}
              {!past && locked && !isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold
                                 bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400
                                 px-2 py-0.5 rounded-full">
                  🔒 Locked
                </span>
              )}
              {!past && !locked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold
                                 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400
                                 px-2 py-0.5 rounded-full">
                  ● Roles open
                </span>
              )}
              {!past && !locked && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Locks {getMeetingLockTimeIST(meeting, lockBeforeMins)} IST on meeting day
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {ballot?.status === 'open' && memberId && deviceId && (
              <button
                onClick={() => setShowBallot(true)}
                className="pulse-vote bg-gold-300 hover:bg-gold-400 text-slate-900 font-black text-[10px] uppercase tracking-wide
                           px-3 py-1.5 rounded-full transition-colors shadow-sm"
              >
                Vote Now
              </button>
            )}
            {ballot?.status === 'closed' && (
              <button
                onClick={() => setShowBallot(true)}
                className="bg-navy-700 hover:bg-navy-800 dark:bg-navy-700/80 text-gold-300
                           font-bold text-[10px] px-3 py-1.5 rounded-full transition-colors shadow-sm"
              >
                🏆 Results
              </button>
            )}
            {!past && (
              <button
                onClick={() => setShowAgenda(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold
                           bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
                           hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95
                           transition-all min-h-[32px]"
              >
                📋 Agenda
              </button>
            )}
            {!past && !hideWhatsApp && ballot?.status !== 'open' && ballot?.status !== 'closed' && (
              <WhatsAppCopyButton meeting={meeting} members={allMembers} lockBeforeMins={lockBeforeMins} />
            )}
          </div>
        </div>
      </div>

      {/* ── Theme band ── */}
      {(meeting.theme || canEditTheme) && (
        <div className={`px-4 py-2.5 border-b flex items-center gap-3
          ${past
            ? 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800'
            : 'bg-gradient-to-r from-maroon-50/80 via-white to-white dark:from-maroon-950/15 dark:via-slate-900 dark:to-slate-900 border-maroon-100 dark:border-maroon-900/30'}`}
        >
          <span className="text-lg leading-none shrink-0">🌐</span>
          <div className="min-w-0 flex-1">
            {editingTheme ? (
              <div className="flex items-center gap-2">
                <input
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value)}
                  placeholder="Enter meeting theme…"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTheme(); if (e.key === 'Escape') setEditingTheme(false); }}
                  className="flex-1 min-w-0 border border-maroon-200 dark:border-maroon-800 rounded-lg px-2 py-1 text-sm
                             text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800
                             focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500"
                />
                <button onClick={saveTheme} disabled={savingTheme}
                  className="text-xs font-semibold text-maroon-700 dark:text-maroon-400 hover:text-maroon-900 min-h-[36px] disabled:opacity-40 shrink-0">
                  {savingTheme ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditingTheme(false); setThemeInput(meeting.theme ?? ''); }}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-h-[36px] shrink-0">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {meeting.theme ? (
                  <p className={`font-serif text-sm font-bold leading-snug
                    ${past ? 'text-slate-500 dark:text-slate-400' : 'text-maroon-800 dark:text-maroon-300'}`}>
                    &ldquo;{meeting.theme}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No theme set yet</p>
                )}
                {canEditTheme && (
                  <button onClick={() => setEditingTheme(true)}
                    className="text-sm min-h-[32px] min-w-[32px] shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                    title="Edit theme">✏️</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Role sections ── */}
      <div className="p-4 space-y-5">

        {/* Speakers — grouped by heat when groups are defined, else a flat grid */}
        {hasGroups ? (
          groupBuckets.map(({ group, slots }) => (
            slots.length === 0 && !isAdmin ? null : (
            <section key={group?.id ?? 'unassigned'}>
              <SectionLabel icon="🎙️" text={group ? group.name : 'Unassigned'} />
              <div className="space-y-2 mt-2">
                {slots.length === 0 ? (
                  <p className="text-xs italic text-slate-300 dark:text-slate-600 px-1">No pairs in this group yet</p>
                ) : slots.map((slot, i) => (
                  <div key={slot} className="space-y-1.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/30 p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-maroon-600 dark:text-maroon-400">
                        Speaker {i + 1}
                      </span>
                      {isAdmin && (
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            onClick={() => movePair(slot, -1)}
                            disabled={i === 0}
                            aria-label="Move up"
                            className="w-6 h-6 rounded-lg text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs"
                          >▲</button>
                          <button
                            onClick={() => movePair(slot, 1)}
                            disabled={i === slots.length - 1}
                            aria-label="Move down"
                            className="w-6 h-6 rounded-lg text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs"
                          >▼</button>
                          <select
                            value={groupIdForSlot(meeting, slot) ?? ''}
                            onChange={(e) => assignPairGroup(slot, e.target.value)}
                            aria-label="Group"
                            className="text-[11px] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1
                                       bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300
                                       focus:outline-none focus:ring-1 focus:ring-maroon-400"
                          >
                            <option value="">Unassigned</option>
                            {speakerGroups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <RoleSlot {...slotProps('speaker', slot)} variant="chip" />
                      {evaluatorEnabled && slot <= meeting.evaluator_slots && (
                        <RoleSlot {...slotProps('evaluator', slot)} variant="chip" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            )
          ))
        ) : speakerRoles.length > 0 && (
        <section>
          <SectionLabel icon="🎙️" text="Prepared Speakers & Evaluators" />
          <div className="space-y-2 mt-2">
            {speakerRoles.map(({ slot }) => (
              <div key={slot} className="rounded-xl bg-slate-50/60 dark:bg-slate-800/30 p-2 space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-maroon-600 dark:text-maroon-400">
                  Speaker {slot}
                </span>
                {evaluatorEnabled && slot <= meeting.evaluator_slots ? (
                  <div className="grid grid-cols-2 gap-2">
                    <RoleSlot {...slotProps('speaker', slot)} variant="chip" />
                    <RoleSlot {...slotProps('evaluator', slot)} variant="chip" />
                  </div>
                ) : (
                  <RoleSlot {...slotProps('speaker', slot)} variant="chip" />
                )}
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Speaker slot request */}
        {!past && (canRequestSlot || slotRequest) && (
          <div className="mt-1">
            {slotRequest ? (
              <div className={`rounded-xl px-3 py-2.5 border text-xs ${
                slotRequest.status === 'pending'
                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400'
                  : slotRequest.status === 'approved'
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400'
              }`}>
                <p className="font-semibold">
                  {slotRequest.status === 'pending' && '⏳ Extra speaker slot request pending'}
                  {slotRequest.status === 'approved' && '✓ Extra speaker slot approved — you\'ve been added!'}
                  {slotRequest.status === 'denied' && '✗ Extra speaker slot request denied'}
                </p>
                {slotRequest.review_comment && (
                  <p className="mt-1 opacity-80">{slotRequest.review_comment}</p>
                )}
              </div>
            ) : showRequestForm ? (
              <div className="rounded-xl border border-maroon-200 dark:border-maroon-800/50 bg-maroon-50 dark:bg-maroon-950/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-maroon-700 dark:text-maroon-400">Request an extra speaker slot</p>
                <textarea
                  value={requestNote}
                  onChange={e => setRequestNote(e.target.value)}
                  placeholder="Why do you want to speak? (optional)"
                  rows={2}
                  maxLength={200}
                  className="w-full text-xs border border-maroon-200 dark:border-maroon-800/50 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-maroon-600 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                />
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-maroon-600 dark:text-maroon-400 mb-1">
                    Preferred evaluator (optional)
                  </label>
                  <select
                    value={requestEvaluatorId}
                    onChange={e => setRequestEvaluatorId(e.target.value)}
                    className="w-full text-xs border border-maroon-200 dark:border-maroon-800/50 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-maroon-600"
                  >
                    <option value="">No preference — open to anyone</option>
                    {allMembers.filter(m => m.id !== memberId && !unavailableEvaluatorIds.includes(m.id)).map(m => (
                      <option key={m.id} value={m.id}>TM {m.display_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={submitRequest} disabled={submitting}
                    className="flex-1 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-semibold rounded-lg py-2 disabled:opacity-40 active:scale-95 transition-all">
                    {submitting ? 'Sending…' : 'Send Request'}
                  </button>
                  <button onClick={() => { setShowRequestForm(false); setRequestNote(''); }}
                    className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRequestForm(true)}
                className="w-full text-xs font-semibold text-maroon-600 dark:text-maroon-400
                           border border-dashed border-maroon-300 dark:border-maroon-800/60
                           hover:bg-maroon-50 dark:hover:bg-maroon-950/20 rounded-xl py-2.5
                           transition-colors"
              >
                🎙️ Request extra speaker slot
              </button>
            )}
          </div>
        )}

        {/* Evaluators without a paired speaker (extra eval slots, or speakers
            disabled) — normal pairs are shown inline with the speaker above. */}
        {!hasGroups && extraEvaluatorRoles.length > 0 && (
        <section>
          <SectionLabel icon="⚖️" text="Evaluators" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            {extraEvaluatorRoles.map(({ roleKey, slot }) => (
              <RoleSlot
                key={`${roleKey}:${slot}`}
                {...slotProps(roleKey as RoleKey, slot)}
                variant="chip"
              />
            ))}
          </div>
        </section>
        )}

        {/* Jury — admin-assigned panel of judges */}
        {juryRoles.length > 0 && (
        <section>
          <SectionLabel icon="🧑‍⚖️" text="Jury" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            {juryRoles.map(({ roleKey, slot }) => (
              <RoleSlot
                key={`${roleKey}:${slot}`}
                {...slotProps(roleKey as RoleKey, slot)}
                variant="chip"
              />
            ))}
          </div>
        </section>
        )}

        {/* Main roles — 3-column chip grid */}
        {mainRoles.length > 0 && (
        <section>
          <SectionLabel icon="👥" text="Core Roles" />
          <div className="grid grid-cols-3 gap-2 mt-2">
            {mainRoles.map(({ roleKey, slot }) => (
              <RoleSlot
                key={`${roleKey}:${slot}`}
                {...slotProps(roleKey as RoleKey, slot)}
                variant="chip"
              />
            ))}
          </div>
        </section>
        )}

        {/* Auxiliary roles — 2-column mini grid */}
        {tagRoles.length > 0 && (
        <section>
          <SectionLabel icon="🛠️" text="Auxiliary Roles" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            {tagRoles.map(({ roleKey, slot }) => (
              <RoleSlot
                key={`${roleKey}:${slot}`}
                {...slotProps(roleKey as RoleKey, slot)}
                variant="mini"
              />
            ))}
          </div>
        </section>
        )}
      </div>
    </article>

    {showAgenda && (
      <AgendaModal
        meeting={meeting}
        members={allMembers}
        onClose={() => setShowAgenda(false)}
      />
    )}
    {showBallot && ballot && (ballot.status === 'closed' || (memberId && deviceId)) && (
      <BallotModal
        ballot={ballot}
        meeting={meeting}
        allMembers={allMembers}
        memberId={memberId ?? null}
        deviceId={deviceId ?? null}
        isAdmin={isAdmin}
        onClose={() => setShowBallot(false)}
      />
    )}
    </>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm leading-none">{icon}</span>
      <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {text}
      </h3>
      <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
