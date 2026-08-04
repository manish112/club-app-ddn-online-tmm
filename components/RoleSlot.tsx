'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member, ParticipationMode, RoleClaim, RoleKey } from '@/lib/types';
import { ASSIGN_ONLY_ROLES, LEVELS, PATHS, ROLE_META } from '@/lib/types';
import type { RoleReservation } from '@/lib/utils';
import { roleClaimBlocked, consecutiveRoleBlocked, reservationBlocked, speechTimeRange } from '@/lib/utils';

interface Props {
  meetingId: string;
  meetingNumber: number;
  meetingDate: string;
  roleKey: RoleKey;
  slotIndex: number;
  claim: RoleClaim | null;
  memberId: string | null;
  memberExistingRoles: RoleKey[];
  memberAdjacentRoles?: RoleKey[];
  // Online-only reservation: while `reservation.active`, only members whose
  // participation mode is 'online' may claim. null = feature off.
  reservation?: RoleReservation | null;
  participationMode?: ParticipationMode;
  isLocked: boolean;
  isPast: boolean;
  isAdmin: boolean;
  allMembers?: Member[];
  // For an unclaimed evaluator slot: the display name of a speaker-nominated
  // evaluator awaiting officer approval. When set, the slot is held (blocked)
  // and shows "Assignment in progress" instead of a claim affordance.
  pendingEvaluatorName?: string | null;
  // For an evaluator slot whose paired speaker slot is still empty: the slot is
  // locked ("Opens when speaker claims") for members so no one grabs it before
  // the speaker names their preference. Admins can still assign.
  awaitingSpeaker?: boolean;
  // Members already spoken for as evaluators in this meeting (assigned to an
  // evaluator slot, or pending as another speaker's nominee) — hidden from the
  // evaluator picker so a speaker can't nominate someone already taken.
  unavailableEvaluatorIds?: string[];
  variant?: 'row' | 'chip' | 'mini';
  onChanged: () => void;
}

function notifyRole(payload: {
  meetingId: string;
  targetMemberId: string;
  roleKey: RoleKey;
  action: 'claimed' | 'released' | 'assigned' | 'removed';
  actorId: string | null;
  actorIsAdmin: boolean;
}) {
  fetch('/api/notify-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function RoleSlot({
  meetingId, meetingNumber, meetingDate, roleKey, slotIndex, claim, memberId, memberExistingRoles,
  memberAdjacentRoles = [], reservation = null, participationMode = 'online',
  isLocked, isPast, isAdmin, allMembers = [],
  pendingEvaluatorName = null, awaitingSpeaker = false, unavailableEvaluatorIds = [],
  variant = 'row', onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [choosingEvaluator, setChoosingEvaluator] = useState(false);
  const supabase = createClient();
  const meta = ROLE_META[roleKey];

  const isOwn = claim ? claim.member_id === memberId : false;
  const isGuest = memberId === 'guest';
  // Assign-only roles (e.g. Jury) can never be self-claimed — only an admin fills
  // them, and only an admin can remove them (members can't drop themselves).
  const assignOnly = ASSIGN_ONLY_ROLES.includes(roleKey);
  const canRelease = claim && (isAdmin || (isOwn && !assignOnly)) && (!isLocked || isAdmin);

  const blockReason = (!claim && memberId && !isGuest && !isAdmin && !assignOnly)
    ? roleClaimBlocked(roleKey, memberExistingRoles)
      ?? consecutiveRoleBlocked(roleKey, memberAdjacentRoles)
      ?? reservationBlocked(participationMode, reservation)
    : null;
  const canClaim = !claim && memberId && !isGuest && (!isLocked || isAdmin) && !blockReason && !assignOnly;
  const isMultiRole = memberExistingRoles.length > 0;

  const isSpeaker = roleKey === 'speaker';
  const canEditDetails = !!claim && isSpeaker && (isAdmin || (isOwn && !isPast));

  async function handleClaim() {
    if (!memberId || !canClaim || busy) return;
    // Claiming a Prepared Speaker slot first asks who the speaker would like as
    // their evaluator; the claim is finalized from the modal.
    if (isSpeaker) { setChoosingEvaluator(true); return; }
    setBusy(true);
    await supabase.from('role_claims').insert({
      meeting_id: meetingId,
      role_key: roleKey,
      slot_index: slotIndex,
      member_id: memberId,
      admin_override: isMultiRole,
    });
    setBusy(false);
    setJustClaimed(true);
    setTimeout(() => setJustClaimed(false), 400);
    notifyRole({ meetingId, targetMemberId: memberId, roleKey, action: 'claimed', actorId: memberId, actorIsAdmin: isAdmin });
    onChanged();
  }

  // Finalize a speaker claim from the evaluator-preference modal. When a
  // preferred evaluator is chosen, a pending request is created (holding the
  // paired evaluator slot) and the officers are notified; "no preference"
  // leaves that slot open for anyone to claim.
  async function finalizeSpeakerClaim(preferredEvaluatorId: string | null) {
    if (!memberId || busy) return;
    setBusy(true);
    await supabase.from('role_claims').insert({
      meeting_id: meetingId,
      role_key: 'speaker',
      slot_index: slotIndex,
      member_id: memberId,
      admin_override: isMultiRole,
    });
    if (preferredEvaluatorId) {
      // One pending nomination per speaker: retire any earlier one first.
      await supabase.from('evaluator_requests')
        .update({ status: 'cancelled' })
        .eq('meeting_id', meetingId).eq('speaker_id', memberId).eq('status', 'pending');
      const { data: evalReq } = await supabase.from('evaluator_requests').insert({
        meeting_id: meetingId,
        speaker_slot_index: slotIndex,
        speaker_id: memberId,
        preferred_evaluator_id: preferredEvaluatorId,
        status: 'pending',
      }).select('id').single();
      fetch('/api/notify-evaluator-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNumber, meetingDate, speakerId: memberId, preferredEvaluatorId }),
      }).catch(() => {});
      // Confirm to the speaker and notify the nominated evaluator.
      if (evalReq?.id) {
        fetch('/api/notify-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'evaluator', event: 'submitted', requestId: evalReq.id }),
        }).catch(() => {});
      }
    }
    setBusy(false);
    setChoosingEvaluator(false);
    setJustClaimed(true);
    setTimeout(() => setJustClaimed(false), 400);
    notifyRole({ meetingId, targetMemberId: memberId, roleKey: 'speaker', action: 'claimed', actorId: memberId, actorIsAdmin: isAdmin });
    onChanged();
  }

  async function handleRelease() {
    if (!claim || !canRelease || busy) return;
    setBusy(true);
    await supabase.from('role_claims').delete().eq('id', claim.id);
    // Releasing a speaker vacates the whole pair: drop the paired evaluator (there's
    // no one to evaluate) and cancel any pending evaluator request, then trim any
    // now-empty extra slots back toward the meeting's configured base count.
    if (roleKey === 'speaker') {
      await supabase.from('role_claims').delete()
        .eq('meeting_id', meetingId)
        .eq('role_key', 'evaluator')
        .eq('slot_index', slotIndex);
      await supabase.from('evaluator_requests')
        .update({ status: 'cancelled' })
        .eq('meeting_id', meetingId)
        .eq('speaker_slot_index', slotIndex)
        .eq('status', 'pending');
      await trimTrailingSpeakerSlots();
    }
    // The theme belongs to the Toastmaster of the Day — when that role is given
    // up (or removed by an admin), reset the theme to TBD so it isn't left
    // pointing at a TMoD who's no longer on the meeting.
    if (roleKey === 'tmod') {
      await supabase.from('meetings').update({ theme: 'TBD' }).eq('id', meetingId);
    }
    setBusy(false);
    notifyRole({ meetingId, targetMemberId: claim.member_id, roleKey, action: 'released', actorId: memberId, actorIsAdmin: isAdmin });
    onChanged();
  }

  // Remove trailing empty speaker/evaluator slots created by extra-slot requests,
  // shrinking the meeting back toward its configured base — never below the base,
  // and never past an occupied slot (positional slots can't be reindexed safely).
  async function trimTrailingSpeakerSlots() {
    const { data: mtg } = await supabase.from('meetings')
      .select('speaker_slots, base_speaker_slots, pair_order, pair_groups')
      .eq('id', meetingId).single();
    if (!mtg) return;
    const base = mtg.base_speaker_slots ?? mtg.speaker_slots;

    const { data: claims } = await supabase.from('role_claims')
      .select('role_key, slot_index').eq('meeting_id', meetingId).in('role_key', ['speaker', 'evaluator']);
    const maxOccupied = (rk: string) =>
      (claims ?? []).filter((c) => c.role_key === rk).reduce((m, c) => Math.max(m, c.slot_index), 0);

    const target = Math.max(base, maxOccupied('speaker'), maxOccupied('evaluator'));
    if (target >= mtg.speaker_slots) return; // nothing trimmable

    // Clean up anything sitting on the slots being removed.
    await supabase.from('role_claims').delete()
      .eq('meeting_id', meetingId).eq('role_key', 'evaluator').gt('slot_index', target);
    await supabase.from('evaluator_requests').update({ status: 'cancelled' })
      .eq('meeting_id', meetingId).gt('speaker_slot_index', target).eq('status', 'pending');

    const pairOrder = Array.isArray(mtg.pair_order)
      ? (mtg.pair_order as number[]).filter((s) => s <= target) : [];
    const pairGroups: Record<string, string> = { ...(mtg.pair_groups ?? {}) };
    for (const k of Object.keys(pairGroups)) if (Number(k) > target) delete pairGroups[k];

    await supabase.from('meetings').update({
      speaker_slots: target,
      evaluator_slots: target,
      pair_order: pairOrder,
      pair_groups: pairGroups,
    }).eq('id', meetingId);
  }

  async function handleAdminAssign(selectedId: string) {
    if (!selectedId || busy) return;
    setBusy(true);
    await supabase.from('role_claims').insert({
      meeting_id: meetingId,
      role_key: roleKey,
      slot_index: slotIndex,
      member_id: selectedId,
      admin_override: true,
    });
    setBusy(false);
    setAssigning(false);
    notifyRole({ meetingId, targetMemberId: selectedId, roleKey, action: 'assigned', actorId: memberId, actorIsAdmin: isAdmin });
    onChanged();
  }

  const claimantName = claim?.member?.display_name
    ? `TM ${claim.member.display_name}`
    : claim?.member?.name ?? '…';

  const shortName = claim?.member?.display_name ?? claim?.member?.name ?? '…';

  // ── CHIP VARIANT ─────────────────────────────────────────────────────────
  if (variant === 'chip') {
    const readOnly = (isPast || isLocked) && !isAdmin;

    const base = `rounded-xl border flex flex-col gap-1 p-2.5 transition-all duration-200 min-h-[72px]`;

    // Filled
    if (claim) {
      const chipCls = `${base} ${justClaimed ? 'claim-anim' : ''} ${
        isOwn
          ? 'bg-maroon-50 dark:bg-maroon-950/25 border-maroon-300/50 dark:border-maroon-700/50'
          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50'
      }`;

      if (editingDetails && canEditDetails) {
        return (
          <div className={`${base} bg-white dark:bg-slate-800 border-maroon-300 dark:border-maroon-700 col-span-full`}>
            <SpeechEditorInline
              claim={claim}
              onClose={() => setEditingDetails(false)}
              onSaved={() => { setEditingDetails(false); onChanged(); }}
            />
          </div>
        );
      }

      return (
        <div className={chipCls}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {meta.emoji} {meta.label}
            </span>
            {canRelease && !readOnly && (
              <button
                onClick={handleRelease}
                disabled={busy}
                className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 text-xs leading-none p-0.5 transition-colors shrink-0"
                aria-label="Release"
              >
                {busy ? '…' : '✕'}
              </button>
            )}
          </div>
          <p className={`text-sm font-semibold leading-tight ${isOwn ? 'text-maroon-700 dark:text-maroon-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {claimantName}
            {isOwn && <span className="text-[10px] font-normal text-maroon-400/80 dark:text-maroon-500 ml-1">(you)</span>}
          </p>
          {isSpeaker && claim.speech_title && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight break-words">
              &ldquo;{claim.speech_title}&rdquo;
            </p>
          )}
          {isSpeaker && (claim.path || claim.speech_level || claim.project) && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 break-words">
              {[claim.path, claim.speech_level ? `L${claim.speech_level}` : null, claim.project].filter(Boolean).join(' · ')}
            </p>
          )}
          {isSpeaker && (() => {
            const { min, max } = speechTimeRange(claim);
            return <p className="text-[10px] text-slate-400 dark:text-slate-500">⏱ {min}–{max} min</p>;
          })()}
          {canEditDetails && (
            <button
              onClick={() => setEditingDetails(true)}
              className="text-[10px] text-maroon-600 dark:text-maroon-400 hover:underline mt-0.5 text-left"
            >
              {claim.speech_title ? '✏️ Edit details' : '+ Add speech details'}
            </button>
          )}
        </div>
      );
    }

    // Evaluator slot stays locked until the paired speaker claims their slot, so
    // it can't be grabbed before the speaker names their preference. (Admins can
    // still assign directly.)
    if (roleKey === 'evaluator' && awaitingSpeaker && !isAdmin && !readOnly) {
      return (
        <div className={`${base} border-dashed border-slate-100 dark:border-slate-800 opacity-60`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {meta.emoji} {meta.label}
          </span>
          <p className="text-[11px] italic text-slate-400 dark:text-slate-500 leading-tight mt-auto">
            🔒 Opens when speaker claims
          </p>
        </div>
      );
    }

    // Evaluator slot held for a speaker-nominated evaluator awaiting approval.
    if (roleKey === 'evaluator' && pendingEvaluatorName) {
      return (
        <div className={`${base} border-dashed border-amber-300/60 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/20`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {meta.emoji} {meta.label}
          </span>
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-tight mt-auto">
            ⏳ Assignment in progress
          </p>
          <p className="text-[10px] text-amber-600/80 dark:text-amber-500/90 leading-tight">
            Awaiting approval
          </p>
        </div>
      );
    }

    // Admin assign
    if (isAdmin && assigning) {
      return (
        <div className={`${base} bg-maroon-50 dark:bg-maroon-950/20 border-maroon-200 dark:border-maroon-800/50 col-span-full`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{meta.emoji} {meta.label}</span>
          <select
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5
                       bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200
                       focus:outline-none focus:ring-1 focus:ring-maroon-400"
            defaultValue=""
            onChange={(e) => e.target.value && handleAdminAssign(e.target.value)}
            disabled={busy}
            autoFocus
          >
            <option value="" disabled>Pick member…</option>
            {allMembers.map((m) => (
              <option key={m.id} value={m.id}>TM {m.display_name}</option>
            ))}
          </select>
          <button onClick={() => setAssigning(false)} className="text-[10px] text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
      );
    }

    // Empty chip
    const emptyChipCls = `${base} border-dashed ${
      readOnly
        ? 'border-slate-100 dark:border-slate-800/60 opacity-50'
        : blockReason
          // Not faded: the reason is the only thing telling the member why they
          // can't claim, so it has to stay readable.
          ? 'border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/30'
          : canClaim || isAdmin
            ? 'border-slate-200 dark:border-slate-700 hover:border-maroon-300 dark:hover:border-maroon-700 hover:bg-maroon-50/50 dark:hover:bg-maroon-950/10 cursor-pointer active:scale-[0.97]'
            : 'border-slate-100 dark:border-slate-800 opacity-50'
    }`;

    const handleEmptyClick = isAdmin ? () => setAssigning(true) : canClaim ? handleClaim : undefined;

    return (
      <>
        <div className={emptyChipCls} onClick={handleEmptyClick} role={handleEmptyClick ? 'button' : undefined}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {meta.emoji} {meta.label}
          </span>
          <p className="text-xs text-slate-300 dark:text-slate-600 mt-auto">
            {blockReason
              ? <span className="text-[10px] font-bold leading-snug text-slate-600 dark:text-slate-300">{blockReason}</span>
              : busy ? 'Claiming…'
              : isAdmin ? '+ Assign'
              : canClaim ? '+ Claim'
              : assignOnly ? <span className="italic text-[10px]">Admin assigns</span>
              : !memberId || isGuest ? 'Sign in to claim'
              : '—'}
          </p>
        </div>
        {choosingEvaluator && (
          <EvaluatorPreferenceModal
            members={allMembers}
            excludeId={memberId}
            unavailableIds={unavailableEvaluatorIds}
            busy={busy}
            onConfirm={finalizeSpeakerClaim}
            onCancel={() => setChoosingEvaluator(false)}
          />
        )}
      </>
    );
  }

  // ── MINI VARIANT (aux roles) ──────────────────────────────────────────────
  if (variant === 'mini') {
    const readOnly = (isPast || isLocked) && !isAdmin;
    const filled = !!claim;

    const base = `rounded-xl border flex flex-col items-center justify-center gap-1 p-3 min-h-[80px] text-center transition-all duration-200`;

    const miniCls = `${base} ${
      filled
        ? isOwn
          ? `bg-maroon-50 dark:bg-maroon-950/25 border-maroon-300/50 dark:border-maroon-700/50 ${justClaimed ? 'claim-anim' : ''}`
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50'
        : readOnly
          ? 'border-dashed border-slate-100 dark:border-slate-800 opacity-40'
          : blockReason
            // Kept legible — see the chip variant.
            ? 'border-dashed border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/30'
            : canClaim || isAdmin
            ? 'border-dashed border-slate-200 dark:border-slate-700 hover:border-maroon-300 dark:hover:border-maroon-700 hover:bg-maroon-50/50 dark:hover:bg-maroon-950/10 cursor-pointer active:scale-[0.97]'
            : 'border-dashed border-slate-100 dark:border-slate-800 opacity-40'
    }`;

    const handleMiniClick = !filled
      ? isAdmin ? () => setAssigning(true) : canClaim ? handleClaim : undefined
      : canRelease ? handleRelease : undefined;

    if (assigning && isAdmin) {
      return (
        <div className={`${base} border-maroon-200 dark:border-maroon-800/50 bg-maroon-50 dark:bg-maroon-950/20 col-span-full items-start`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 self-start">{meta.emoji} {meta.label}</span>
          <select
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 w-full
                       bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200
                       focus:outline-none focus:ring-1 focus:ring-maroon-400 mt-1"
            defaultValue=""
            onChange={(e) => e.target.value && handleAdminAssign(e.target.value)}
            disabled={busy}
            autoFocus
          >
            <option value="" disabled>Pick…</option>
            {allMembers.map((m) => (
              <option key={m.id} value={m.id}>TM {m.display_name}</option>
            ))}
          </select>
          <button onClick={() => setAssigning(false)} className="text-[10px] text-slate-400 hover:text-slate-600 mt-1">✕</button>
        </div>
      );
    }

    return (
      <div className={miniCls} onClick={handleMiniClick} role={handleMiniClick ? 'button' : undefined}>
        <span className="text-xl leading-none">{meta.emoji}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 leading-tight">
          {meta.label}
        </span>
        <span className={`text-xs font-semibold leading-tight line-clamp-3 max-w-full px-0.5 ${
          filled
            ? isOwn ? 'text-maroon-700 dark:text-maroon-400' : 'text-slate-700 dark:text-slate-300'
            : 'text-slate-300 dark:text-slate-600'
        }`}>
          {filled
            ? claimantName
            : busy ? '…'
            : isAdmin ? '+ Assign'
            : canClaim ? '+ Claim'
            : assignOnly ? 'Admin assigns'
            : blockReason ? <span className="text-[10px] font-bold leading-snug text-slate-600 dark:text-slate-300">{blockReason}</span>
            : '—'}
        </span>
      </div>
    );
  }

  // ── ROW VARIANT (default) ─────────────────────────────────────────────────

  // Read-only (past or locked)
  if ((isPast || isLocked) && !isAdmin) {
    return (
      <>
        <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl
                        bg-slate-50 dark:bg-slate-800/50">
          <span className="text-base shrink-0">{meta.emoji}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400 font-medium shrink-0">{meta.label}</span>
          <span className="text-sm text-slate-800 dark:text-slate-200 ml-auto truncate max-w-[160px]">
            {claim ? claimantName : <span className="text-slate-300 dark:text-slate-600">—</span>}
          </span>
        </div>
        {claim && isSpeaker && (
          <SpeechDetailsBlock claim={claim} canEdit={false} onChanged={onChanged} />
        )}
      </>
    );
  }

  // Slot filled
  if (claim) {
    return (
      <>
        <div className={`flex items-center gap-2 py-2.5 px-3 rounded-xl transition-colors
          ${justClaimed ? 'claim-anim' : ''}
          ${isOwn
            ? 'bg-maroon-50 dark:bg-maroon-950/25 border border-maroon-200 dark:border-maroon-800/50'
            : 'bg-slate-50 dark:bg-slate-800/50'}`}
        >
          <span className="text-base shrink-0">{meta.emoji}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400 font-medium shrink-0">{meta.label}</span>
          <span className={`text-sm font-semibold ml-auto truncate max-w-[140px]
            ${isOwn ? 'text-maroon-700 dark:text-maroon-400' : 'text-slate-800 dark:text-slate-200'}`}>
            {claimantName}
            {isOwn && <span className="text-xs font-normal text-maroon-400 dark:text-maroon-500 ml-1">(you)</span>}
          </span>
          {canRelease && (
            <button
              onClick={handleRelease}
              disabled={busy}
              className="shrink-0 ml-1 text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400
                         min-h-[36px] px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              aria-label={`Release ${meta.label}`}
            >
              {busy ? '…' : '✕'}
            </button>
          )}
        </div>
        {isSpeaker && (
          <SpeechDetailsBlock claim={claim} canEdit={canEditDetails} onChanged={onChanged} />
        )}
      </>
    );
  }

  // Admin: assign member
  if (isAdmin) {
    if (assigning) {
      return (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl
                        border border-maroon-200 dark:border-maroon-800/50
                        bg-maroon-50 dark:bg-maroon-950/20">
          <span className="text-base shrink-0">{meta.emoji}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400 font-medium shrink-0">{meta.label}</span>
          <select
            className="ml-auto flex-1 min-w-0 text-sm border border-slate-200 dark:border-slate-700
                       rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200
                       focus:outline-none focus:ring-1 focus:ring-maroon-400"
            defaultValue=""
            onChange={(e) => e.target.value && handleAdminAssign(e.target.value)}
            disabled={busy}
            autoFocus
          >
            <option value="" disabled>Pick member…</option>
            {allMembers.map((m) => (
              <option key={m.id} value={m.id}>TM {m.display_name}</option>
            ))}
          </select>
          <button
            onClick={() => setAssigning(false)}
            className="shrink-0 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-h-[36px] px-1"
          >✕</button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setAssigning(true)}
        className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed
                   border-slate-200 dark:border-slate-700 hover:border-maroon-300 dark:hover:border-maroon-700
                   hover:bg-maroon-50 dark:hover:bg-maroon-950/20
                   active:scale-[0.98] transition-all min-h-[44px] text-left group"
      >
        <span className="text-base shrink-0 opacity-40 group-hover:opacity-100">{meta.emoji}</span>
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium shrink-0 group-hover:text-maroon-700 dark:group-hover:text-maroon-400">{meta.label}</span>
        <span className="ml-auto text-xs text-maroon-600 dark:text-maroon-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
          Assign
        </span>
      </button>
    );
  }

  // Blocked
  if (blockReason) {
    return (
      <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed
                      border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/30">
        <span className="text-base shrink-0 opacity-60">{meta.emoji}</span>
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium shrink-0">{meta.label}</span>
        <span className="ml-auto text-xs font-bold text-slate-600 dark:text-slate-300 text-right leading-snug">{blockReason}</span>
      </div>
    );
  }

  // Assign-only role (e.g. Jury) with no claim — members see a muted placeholder.
  if (assignOnly) {
    return (
      <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed
                      border-slate-100 dark:border-slate-800 opacity-60">
        <span className="text-base shrink-0">{meta.emoji}</span>
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium shrink-0">{meta.label}</span>
        <span className="ml-auto text-xs text-slate-300 dark:text-slate-600 italic">Admin assigns</span>
      </div>
    );
  }

  // Empty claimable slot
  return (
    <>
      <button
        onClick={handleClaim}
        disabled={busy || !memberId || isGuest}
        className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed
                   border-slate-200 dark:border-slate-700 hover:border-maroon-300 dark:hover:border-maroon-700
                   hover:bg-maroon-50 dark:hover:bg-maroon-950/20
                   active:scale-[0.98] transition-all min-h-[44px]
                   disabled:opacity-40 disabled:cursor-not-allowed text-left group"
      >
        <span className="text-base shrink-0 opacity-50 group-hover:opacity-100">{meta.emoji}</span>
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium shrink-0 group-hover:text-maroon-700 dark:group-hover:text-maroon-400">{meta.label}</span>
        {memberId && !isGuest ? (
          <span className="ml-auto text-xs text-maroon-600 dark:text-maroon-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            {busy ? 'Claiming…' : 'Tap to claim'}
          </span>
        ) : (
          <span className="ml-auto text-xs text-slate-300 dark:text-slate-600">Sign in to claim</span>
        )}
      </button>
      {choosingEvaluator && (
        <EvaluatorPreferenceModal
          members={allMembers}
          excludeId={memberId}
          busy={busy}
          onConfirm={finalizeSpeakerClaim}
          onCancel={() => setChoosingEvaluator(false)}
        />
      )}
    </>
  );
}

function SpeechDetailsBlock({
  claim, canEdit, onChanged,
}: { claim: RoleClaim; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SpeechEditorInline
        claim={claim}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onChanged(); }}
      />
    );
  }

  const hasTitle = !!claim.speech_title;
  const hasMeta = !!(claim.path || claim.speech_level || claim.project);
  const metaParts = [
    claim.path,
    claim.speech_level ? `L${claim.speech_level}` : null,
    claim.project,
  ].filter(Boolean);
  const { min: tMin, max: tMax } = speechTimeRange(claim);

  return (
    <div className="ml-9 mt-1 mb-1 pl-3 border-l-2 border-maroon-100 dark:border-maroon-900/50">
      {hasTitle ? (
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug">
          &ldquo;{claim.speech_title}&rdquo;
        </p>
      ) : (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">Title TBD</p>
      )}
      {hasMeta && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{metaParts.join(' · ')}</p>
      )}
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">⏱ {tMin}–{tMax} min</p>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="mt-1 text-xs font-medium text-maroon-600 dark:text-maroon-400 hover:text-maroon-700 dark:hover:text-maroon-300 min-h-[36px]"
        >
          {hasTitle || hasMeta ? 'Edit speech details' : '+ Add speech details'}
        </button>
      )}
    </div>
  );
}

function SpeechEditorInline({
  claim, onClose, onSaved,
}: { claim: RoleClaim; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [path, setPath] = useState<string>(claim.path ?? '');
  const [level, setLevel] = useState<string>(claim.speech_level?.toString() ?? '');
  const [project, setProject] = useState<string>(claim.project ?? '');
  const [title, setTitle] = useState<string>(claim.speech_title ?? '');
  const [minMins, setMinMins] = useState<string>((claim.speech_min_mins ?? 5).toString());
  const [maxMins, setMaxMins] = useState<string>((claim.speech_max_mins ?? 7).toString());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const min = Number(minMins);
    const max = Number(maxMins);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < 1 || max > 60 || min > max) {
      setErr('Enter a valid time (min ≤ max, 1–60).');
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('role_claims')
      .update({
        path: path || null,
        speech_level: level ? Number(level) : null,
        project: project.trim() || null,
        speech_title: title.trim() || null,
        speech_min_mins: min,
        speech_max_mins: max,
      })
      .eq('id', claim.id);
    setBusy(false);
    if (error) { setErr('Could not save — please retry.'); return; }
    onSaved();
  }

  const inputCls = 'text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-maroon-400';

  return (
    <div className="ml-9 mt-1 mb-2 pl-3 border-l-2 border-maroon-300 dark:border-maroon-700 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select value={path} onChange={(e) => setPath(e.target.value)} className={inputCls}>
          <option value="">Path…</option>
          {PATHS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
          <option value="">Level…</option>
          {LEVELS.map((l) => <option key={l} value={l}>Level {l}</option>)}
        </select>
      </div>
      <input type="text" value={project} onChange={(e) => setProject(e.target.value)}
        placeholder="Project (e.g. Ice Breaker)" className={`w-full ${inputCls}`} maxLength={120} />
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Speech title" className={`w-full ${inputCls}`} maxLength={160} />
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">⏱ Time</span>
        <input type="number" inputMode="numeric" min={1} max={60} value={minMins}
          onChange={(e) => setMinMins(e.target.value)} aria-label="Minimum minutes"
          className={`w-16 ${inputCls}`} />
        <span className="text-xs text-slate-400">–</span>
        <input type="number" inputMode="numeric" min={1} max={60} value={maxMins}
          onChange={(e) => setMaxMins(e.target.value)} aria-label="Maximum minutes"
          className={`w-16 ${inputCls}`} />
        <span className="text-xs text-slate-400 dark:text-slate-500">min</span>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={save} disabled={busy}
          className="text-xs font-semibold bg-maroon-700 hover:bg-maroon-800 text-white
                     px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 min-h-[36px]"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} disabled={busy}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1.5 min-h-[36px]">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Shown when a member claims a Prepared Speaker slot: nominate a preferred
// evaluator (→ officer approval) or opt out ("no preference" → slot stays open).
function EvaluatorPreferenceModal({
  members, excludeId, unavailableIds = [], busy, onConfirm, onCancel,
}: {
  members: Member[];
  excludeId: string | null;
  unavailableIds?: string[];
  busy: boolean;
  onConfirm: (preferredEvaluatorId: string | null) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState('');
  const unavailable = new Set(unavailableIds);
  const options = members.filter((m) => m.id !== excludeId && !unavailable.has(m.id));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark p-6">
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6 sm:hidden" />
        <p className="text-[10px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-1">Prepared Speech</p>
        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Choose your evaluator</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          Pick who you&apos;d like to evaluate your speech. Your request goes to the President &amp; VP
          Education for approval, and the evaluator slot is held until they approve.
        </p>

        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500 mb-4"
        >
          <option value="">Select a member…</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>TM {m.display_name}</option>
          ))}
        </select>

        <button
          onClick={() => selected && onConfirm(selected)}
          disabled={busy || !selected}
          className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700 text-white rounded-xl py-3 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm mb-2"
        >
          {busy ? 'Claiming…' : 'Request this evaluator'}
        </button>
        <button
          onClick={() => onConfirm(null)}
          disabled={busy}
          className="w-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-sm font-medium min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors mb-3"
        >
          I don&apos;t have a preference
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="block w-full text-center text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px] disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
