'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Ballot, MeetingWithClaims, Member, RoleKey } from '@/lib/types';
import { getMeetingRoles } from '@/lib/types';
import { formatMeetingDate, formatTime, isMeetingLocked, isMeetingPast } from '@/lib/utils';
import { RoleSlot } from './RoleSlot';
import { WhatsAppCopyButton } from './WhatsAppCopyButton';
import { BallotModal } from './BallotModal';

interface Props {
  meeting: MeetingWithClaims;
  allMembers: Member[];
  memberId: string | null;
  memberAdjacentRoles?: RoleKey[];
  deviceId?: string | null;
  ballot?: Ballot;
  isAdmin: boolean;
  hideWhatsApp?: boolean;
  onChanged: () => void;
}

export function MeetingCard({ meeting, allMembers, memberId, memberAdjacentRoles = [], deviceId, ballot, isAdmin, hideWhatsApp, onChanged }: Props) {
  const supabase = createClient();
  const [showBallot, setShowBallot] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const [themeInput, setThemeInput] = useState(meeting.theme ?? '');
  const [savingTheme, setSavingTheme] = useState(false);
  const locked = isMeetingLocked(meeting);
  const past = isMeetingPast(meeting);

  const isTMoD = !!memberId &&
    meeting.role_claims.some((c) => c.role_key === 'tmod' && c.member_id === memberId);

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

  const memberExistingRoles: RoleKey[] = memberId
    ? meeting.role_claims.filter((c) => c.member_id === memberId).map((c) => c.role_key)
    : [];

  const roles = getMeetingRoles(meeting);

  const speakerRoles = roles.filter((r) => r.roleKey === 'speaker');
  const evaluatorRoles = roles.filter((r) => r.roleKey === 'evaluator');
  const mainRoles = roles.filter((r) =>
    ['tmod', 'ttm', 'ge'].includes(r.roleKey)
  );
  const tagRoles = roles.filter((r) =>
    ['grammarian', 'ah_counter', 'timer', 'harkmaster'].includes(r.roleKey)
  );

  return (
    <>
    <article className={`bg-white rounded-2xl shadow-sm border overflow-hidden
      ${past ? 'border-stone-100 opacity-75' : 'border-stone-200'}`}
    >
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 border-b ${past ? 'bg-stone-50 border-stone-100' : 'bg-white border-stone-100'}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-lg font-bold text-stone-900">
                Meeting #{meeting.number}
              </h2>
              {meeting.meeting_type === 'speakathon' && (
                <span className="text-xs font-semibold uppercase tracking-wide
                                 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Speakathon
                </span>
              )}
              {past && (
                <span className="text-xs font-medium text-stone-400 bg-stone-100
                                 px-2 py-0.5 rounded-full">Past</span>
              )}
              {!past && locked && !isAdmin && (
                <span className="text-xs font-medium text-red-500 bg-red-50
                                 px-2 py-0.5 rounded-full">Locked</span>
              )}
            </div>
            <p className="text-sm text-stone-500 mt-0.5">
              {formatMeetingDate(meeting.date)}&nbsp;·&nbsp;<span className="whitespace-nowrap">{formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} IST</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ballot?.status === 'open' && memberId && deviceId && (
              <button
                onClick={() => setShowBallot(true)}
                className="bg-yellow-400 hover:bg-yellow-300 text-navy-800 font-bold text-xs px-3 py-1.5
                           rounded-full transition-colors shadow-sm shrink-0"
              >
                Vote Now
              </button>
            )}
            {ballot?.status === 'closed' && (
              <button
                onClick={() => setShowBallot(true)}
                className="bg-navy-700 hover:bg-navy-600 text-yellow-200 font-bold text-xs px-3 py-1.5
                           rounded-full transition-colors shadow-sm shrink-0"
              >
                🏆 View Results
              </button>
            )}
            {!past && !hideWhatsApp && ballot?.status !== 'open' && ballot?.status !== 'closed' && (
              <WhatsAppCopyButton meeting={meeting} members={allMembers} />
            )}
          </div>
        </div>

        {!past && !locked && (
          <p className="text-xs text-stone-400 mt-2">
            Roles lock at {formatTime(meeting.start_time)} IST on meeting day.
          </p>
        )}
      </div>

      {/* Theme band — editable by TMoD */}
      {(meeting.theme || isTMoD) && (
        <div className={`px-4 py-3 border-b flex items-start gap-3
          ${past
            ? 'bg-stone-50 border-stone-100'
            : 'bg-gradient-to-r from-maroon-50 to-yellow-100 border-maroon-100'}`}
        >
          <span className="text-2xl leading-none shrink-0 mt-0.5">🌐</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-maroon-600/70">
              Theme
            </p>
            {editingTheme ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value)}
                  placeholder="Enter meeting theme…"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTheme(); if (e.key === 'Escape') setEditingTheme(false); }}
                  className="flex-1 min-w-0 border border-maroon-200 rounded-lg px-2 py-1 text-sm
                             text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-maroon-600"
                />
                <button onClick={saveTheme} disabled={savingTheme}
                  className="text-xs font-semibold text-maroon-700 hover:text-maroon-900
                             tap-target disabled:opacity-40 shrink-0">
                  {savingTheme ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditingTheme(false); setThemeInput(meeting.theme ?? ''); }}
                  className="text-xs text-stone-400 hover:text-stone-600 tap-target shrink-0">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {meeting.theme ? (
                  <p className={`font-serif text-base sm:text-lg font-bold leading-snug
                    ${past ? 'text-stone-600' : 'text-maroon-800'}`}>
                    {meeting.theme}
                  </p>
                ) : (
                  <p className="text-sm text-stone-400 italic">No theme set yet</p>
                )}
                {isTMoD && (
                  <button
                    onClick={() => setEditingTheme(true)}
                    className="text-base tap-target shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    title="Edit theme"
                  >
                    ✏️
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role slots */}
      <div className="p-4 space-y-4">
        <RoleSection label="🎙️ Prepared Speakers">
          {speakerRoles.map(({ roleKey, slot }) => (
            <RoleSlot
              key={`${roleKey}:${slot}`}
              meetingId={meeting.id}
              roleKey={roleKey as RoleKey}
              slotIndex={slot}
              claim={claimsMap.get(`${roleKey}:${slot}`) ?? null}
              memberId={memberId}
              memberExistingRoles={memberExistingRoles}
              memberAdjacentRoles={memberAdjacentRoles}
              isLocked={locked}
              isPast={past}
              isAdmin={isAdmin}
              allMembers={allMembers}
              onChanged={onChanged}
            />
          ))}
        </RoleSection>

        <RoleSection label="⚖️ Evaluators">
          {evaluatorRoles.map(({ roleKey, slot }) => (
            <RoleSlot
              key={`${roleKey}:${slot}`}
              meetingId={meeting.id}
              roleKey={roleKey as RoleKey}
              slotIndex={slot}
              claim={claimsMap.get(`${roleKey}:${slot}`) ?? null}
              memberId={memberId}
              memberExistingRoles={memberExistingRoles}
              memberAdjacentRoles={memberAdjacentRoles}
              isLocked={locked}
              isPast={past}
              isAdmin={isAdmin}
              allMembers={allMembers}
              onChanged={onChanged}
            />
          ))}
        </RoleSection>

        <RoleSection label="Main Roles">
          {mainRoles.map(({ roleKey, slot }) => (
            <RoleSlot
              key={`${roleKey}:${slot}`}
              meetingId={meeting.id}
              roleKey={roleKey as RoleKey}
              slotIndex={slot}
              claim={claimsMap.get(`${roleKey}:${slot}`) ?? null}
              memberId={memberId}
              memberExistingRoles={memberExistingRoles}
              memberAdjacentRoles={memberAdjacentRoles}
              isLocked={locked}
              isPast={past}
              isAdmin={isAdmin}
              allMembers={allMembers}
              onChanged={onChanged}
            />
          ))}
        </RoleSection>

        <RoleSection label="Auxiliary Roles">
          {tagRoles.map(({ roleKey, slot }) => (
            <RoleSlot
              key={`${roleKey}:${slot}`}
              meetingId={meeting.id}
              roleKey={roleKey as RoleKey}
              slotIndex={slot}
              claim={claimsMap.get(`${roleKey}:${slot}`) ?? null}
              memberId={memberId}
              memberExistingRoles={memberExistingRoles}
              memberAdjacentRoles={memberAdjacentRoles}
              isLocked={locked}
              isPast={past}
              isAdmin={isAdmin}
              allMembers={allMembers}
              onChanged={onChanged}
            />
          ))}
        </RoleSection>
      </div>
    </article>

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

function RoleSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2">
        {label}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
