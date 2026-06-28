'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member, RoleClaim, RoleKey } from '@/lib/types';
import { LEVELS, PATHS, ROLE_META } from '@/lib/types';
import { roleClaimBlocked, consecutiveRoleBlocked, speechTimeRange } from '@/lib/utils';

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
  isLocked: boolean;
  isPast: boolean;
  isAdmin: boolean;
  allMembers?: Member[];
  variant?: 'row' | 'chip' | 'mini';
  onChanged: () => void;
}

function notifyRole(targetMemberId: string, meetingNumber: number, meetingDate: string, roleKey: RoleKey, action: 'claimed' | 'released' | 'assigned' | 'removed') {
  fetch('/api/notify-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetMemberId, meetingNumber, meetingDate, roleKey, action }),
  }).catch(() => {});
}

export function RoleSlot({
  meetingId, meetingNumber, meetingDate, roleKey, slotIndex, claim, memberId, memberExistingRoles,
  memberAdjacentRoles = [], isLocked, isPast, isAdmin, allMembers = [],
  variant = 'row', onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const supabase = createClient();
  const meta = ROLE_META[roleKey];

  const isOwn = claim ? claim.member_id === memberId : false;
  const canRelease = claim && (isOwn || isAdmin) && (!isLocked || isAdmin);

  const isGuest = memberId === 'guest';
  const blockReason = (!claim && memberId && !isGuest && !isAdmin)
    ? roleClaimBlocked(roleKey, memberExistingRoles)
      ?? consecutiveRoleBlocked(roleKey, memberAdjacentRoles)
    : null;
  const canClaim = !claim && memberId && !isGuest && (!isLocked || isAdmin) && !blockReason;
  const isMultiRole = memberExistingRoles.length > 0;

  const isSpeaker = roleKey === 'speaker';
  const canEditDetails = !!claim && isSpeaker && (isAdmin || (isOwn && !isPast));

  async function handleClaim() {
    if (!memberId || !canClaim || busy) return;
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
    notifyRole(memberId, meetingNumber, meetingDate, roleKey, 'claimed');
    onChanged();
  }

  async function handleRelease() {
    if (!claim || !canRelease || busy) return;
    setBusy(true);
    await supabase.from('role_claims').delete().eq('id', claim.id);
    // The theme belongs to the Toastmaster of the Day — when that role is given
    // up (or removed by an admin), reset the theme to TBD so it isn't left
    // pointing at a TMoD who's no longer on the meeting.
    if (roleKey === 'tmod') {
      await supabase.from('meetings').update({ theme: 'TBD' }).eq('id', meetingId);
    }
    setBusy(false);
    notifyRole(claim.member_id, meetingNumber, meetingDate, roleKey, 'released');
    onChanged();
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
    notifyRole(selectedId, meetingNumber, meetingDate, roleKey, 'assigned');
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
          ? 'border-slate-100 dark:border-slate-800 opacity-40'
          : canClaim || isAdmin
            ? 'border-slate-200 dark:border-slate-700 hover:border-maroon-300 dark:hover:border-maroon-700 hover:bg-maroon-50/50 dark:hover:bg-maroon-950/10 cursor-pointer active:scale-[0.97]'
            : 'border-slate-100 dark:border-slate-800 opacity-50'
    }`;

    const handleEmptyClick = isAdmin ? () => setAssigning(true) : canClaim ? handleClaim : undefined;

    return (
      <div className={emptyChipCls} onClick={handleEmptyClick} role={handleEmptyClick ? 'button' : undefined}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {meta.emoji} {meta.label}
        </span>
        <p className="text-xs text-slate-300 dark:text-slate-600 mt-auto">
          {blockReason
            ? <span className="italic text-[10px]">{blockReason}</span>
            : busy ? 'Claiming…'
            : isAdmin ? '+ Assign'
            : canClaim ? '+ Claim'
            : !memberId || isGuest ? 'Sign in to claim'
            : '—'}
        </p>
      </div>
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
        : blockReason || readOnly
          ? 'border-dashed border-slate-100 dark:border-slate-800 opacity-40'
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
        <span className={`text-xs font-semibold leading-tight line-clamp-2 max-w-full px-0.5 ${
          filled
            ? isOwn ? 'text-maroon-700 dark:text-maroon-400' : 'text-slate-700 dark:text-slate-300'
            : 'text-slate-300 dark:text-slate-600'
        }`}>
          {filled
            ? claimantName
            : busy ? '…'
            : isAdmin ? '+ Assign'
            : canClaim ? '+ Claim'
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
                      border-slate-100 dark:border-slate-800 opacity-50">
        <span className="text-base shrink-0">{meta.emoji}</span>
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium shrink-0">{meta.label}</span>
        <span className="ml-auto text-xs text-slate-300 dark:text-slate-600 italic">{blockReason}</span>
      </div>
    );
  }

  // Empty claimable slot
  return (
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
