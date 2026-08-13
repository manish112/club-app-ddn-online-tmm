'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

import type { ContestResult, EvaluatorRequest, Member, MeetingWithClaims, ParticipationMode, RoleInterestRequest, RoleKey, SpeakerSlotRequest } from '@/lib/types';
import { ROLE_META, LEADERSHIP_ROLES, HOME_CLUB_NAME, WIC_CLUB_NAME, memberLeadershipRoles, isClubOfficer, participationMode, participationModeMeta } from '@/lib/types';
import { SurveyLinks } from '@/components/SurveyLinks';
import { useWicMemberIds } from '@/hooks/useWicMemberIds';
import { CONTEST_RUBRIC, RUBRIC_TOTAL } from '@/lib/contest';
import Link from 'next/link';
import { getMemberRecentRoles, formatMeetingDate, isMeetingPast, groupIdForSlot, roleReservation, offlineClaimWindow, reservationCountdown, DEFAULT_RESERVATION_DAYS_BEFORE, DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE } from '@/lib/utils';
import { MemberAvatar } from '@/components/MemberAvatar';
import { AvatarCropModal } from '@/components/AvatarCropModal';
import { hashPassword, generateSalt, verifyPassword } from '@/lib/crypto';

interface Props {
  member: Member;
  allMembers: Member[];
  meetings: MeetingWithClaims[];
  onUpdated: () => void;
}

function leadershipLabel(role: string | null) {
  return LEADERSHIP_ROLES.find((r) => r.value === role)?.label ?? null;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const cardCls = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-card-light dark:shadow-card-dark p-5';
const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500 placeholder:text-slate-300 dark:placeholder:text-slate-600';
const primaryBtnCls = 'flex-1 bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm';

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({ member, onUpdated }: { member: Member; onUpdated: () => void }) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [intro, setIntro] = useState(member.introduction ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [email, setEmail] = useState(member.email ?? '');
  const [city, setCity] = useState(member.city ?? '');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>(member.gender ?? '');
  const [showPhone, setShowPhone] = useState(member.show_phone_in_contact ?? false);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(member.avatar_url);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailPref, setEmailPref] = useState(member.email_notifications !== false);
  const [waPref, setWaPref] = useState(member.whatsapp_notifications !== false);
  // Whether the club sends this member WhatsApp at all — an admin's decision, not
  // theirs, because each message is billed to the club. When it's off the switch
  // below is shown locked rather than hidden: a member who wonders why no
  // reminders arrive deserves to see why, and who can change it.
  const [waAllowed, setWaAllowed] = useState(member.whatsapp_enabled === true);

  // Read the saved preferences on their own (isolated so a not-yet-migrated
  // column can never break the profile card). Kept as separate reads for the same
  // reason: a database with 046 but not 055 must still load the email one.
  useEffect(() => {
    supabase.from('members').select('email_notifications').eq('id', member.id).maybeSingle()
      .then(({ data }) => { if (data && typeof data.email_notifications === 'boolean') setEmailPref(data.email_notifications); });
    supabase.from('members').select('whatsapp_notifications').eq('id', member.id).maybeSingle()
      .then(({ data }) => { if (data && typeof data.whatsapp_notifications === 'boolean') setWaPref(data.whatsapp_notifications); });
    supabase.from('members').select('whatsapp_enabled').eq('id', member.id).maybeSingle()
      .then(({ data }) => { if (data && typeof data.whatsapp_enabled === 'boolean') setWaAllowed(data.whatsapp_enabled); });
  }, [member.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB.'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleCropSave(blob: Blob) {
    setCropSrc(null);
    setUploading(true);
    const { error } = await supabase.storage.from('member-avatars').upload(member.id, blob, { upsert: true, contentType: 'image/jpeg' });
    if (!error) {
      const { data } = supabase.storage.from('member-avatars').getPublicUrl(member.id);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('members').update({ avatar_url: url }).eq('id', member.id);
      setLocalAvatarUrl(url);
    }
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('members').update({
      introduction: intro.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      city: city.trim() || null,
      gender: gender || null,
      show_phone_in_contact: showPhone,
    }).eq('id', member.id);
    // Save each notification preference separately (best-effort — an unmigrated
    // column must never block the profile save, nor take the other one down).
    await supabase.from('members').update({ email_notifications: emailPref }).eq('id', member.id);
    // Only written while the club allows WhatsApp for this member. Not merely
    // because the switch is disabled in that case — saving would overwrite the
    // preference they had before the admin switched the channel off, so turning
    // it back on later would silently forget what they had asked for.
    if (waAllowed) {
      await supabase.from('members').update({ whatsapp_notifications: waPref }).eq('id', member.id);
    }
    setSaving(false);
    setEditing(false);
    onUpdated();
  }

  function cancel() {
    setIntro(member.introduction ?? '');
    setPhone(member.phone ?? '');
    setEmail(member.email ?? '');
    setCity(member.city ?? '');
    setGender(member.gender ?? '');
    setShowPhone(member.show_phone_in_contact);
    setLocalAvatarUrl(member.avatar_url);
    setCropSrc(null);
    setEditing(false);
  }

  const previewMember = { ...member, avatar_url: localAvatarUrl, gender: gender || null };

  if (cropSrc) {
    return <AvatarCropModal imageSrc={cropSrc} onSave={handleCropSave} onClose={() => setCropSrc(null)} />;
  }

  if (editing) {
    return (
      <div className={cardCls}>
        <h3 className="font-serif text-base font-semibold text-slate-900 dark:text-white mb-4">Edit Profile</h3>
        <form onSubmit={save} className="space-y-3">
          <div className="flex items-center gap-4">
            <MemberAvatar member={previewMember} size={64} />
            <div>
              <label className={`cursor-pointer text-sm font-medium min-h-[36px] flex items-center ${uploading ? 'text-slate-300 pointer-events-none' : 'text-maroon-600 dark:text-maroon-400 hover:text-maroon-800 dark:hover:text-maroon-300'}`}>
                {uploading ? 'Uploading…' : 'Change Photo'}
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
              </label>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">JPEG or PNG · max 2 MB</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}
              className={inputCls}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Introduction</label>
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)}
              placeholder="A short intro about yourself…" rows={3} maxLength={300}
              className={`${inputCls} resize-none`} />
            <p className="text-right text-[10px] text-slate-300 dark:text-slate-600 -mt-1">{intro.length}/300</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210" className={inputCls} />
            {memberLeadershipRoles(member).length > 0 && phone.trim() && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)}
                  className="w-4 h-4 accent-maroon-700 rounded" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Show my phone number on Contact Us against{' '}
                  <strong className="text-slate-700 dark:text-slate-300">{memberLeadershipRoles(member).map(leadershipLabel).filter(Boolean).join(' · ')}</strong>
                </span>
              </label>
            )}
            <label className={`flex items-start gap-2 mt-2 select-none ${waAllowed ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <input type="checkbox" checked={waAllowed && waPref} disabled={!waAllowed}
                onChange={(e) => setWaPref(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0 disabled:opacity-50" />
              <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Send me WhatsApp reminders
                {!waAllowed && (
                  <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                    WhatsApp is not switched on for you. Only a club admin can turn it on — ask the VP
                    Education if you would like reminders on your phone. Your email notifications are
                    unaffected.
                  </span>
                )}
              </span>
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" className={inputCls} />
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input type="checkbox" checked={emailPref} onChange={(e) => setEmailPref(e.target.checked)}
                className="w-4 h-4 accent-maroon-700 rounded" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Send me email notifications</span>
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">City</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="Dehradun" className={inputCls} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || uploading} className={primaryBtnCls}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={cancel}
              className="px-5 py-2.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 min-h-[44px]">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={previewMember} size={56} />
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white font-serif">TM {member.display_name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{member.name}</p>
            {memberLeadershipRoles(member).map((role) => (
              <span key={role} className="inline-block mt-1.5 mr-1 text-[10px] font-semibold
                               bg-gradient-to-r from-maroon-700 to-maroon-600 text-white
                               px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {leadershipLabel(role)}
              </span>
            ))}
          </div>
        </div>
        <button onClick={() => setEditing(true)}
          className="text-xs text-maroon-600 dark:text-maroon-400 font-medium hover:text-maroon-800 dark:hover:text-maroon-300 min-h-[36px] shrink-0">
          Edit ▸
        </button>
      </div>

      {member.introduction && (
        <p className="text-sm text-slate-600 dark:text-slate-400 italic leading-relaxed mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          &ldquo;{member.introduction}&rdquo;
        </p>
      )}

      <div className="space-y-1.5">
        {member.city && (
          <div className="flex items-center gap-2">
            <span className="text-base">📍</span>
            <span className="text-sm text-slate-700 dark:text-slate-300">{member.city}</span>
          </div>
        )}
        {member.email && (
          <div className="flex items-center gap-2">
            <span className="text-base">✉️</span>
            <span className="text-sm text-slate-700 dark:text-slate-300">{member.email}</span>
          </div>
        )}
        {member.phone && (
          <div className="flex items-center gap-2">
            <span className="text-base">📞</span>
            <span className="text-sm text-slate-700 dark:text-slate-300">{member.phone}</span>
          </div>
        )}
        {!member.city && !member.email && !member.phone && !member.introduction && (
          <button onClick={() => setEditing(true)}
            className="text-sm text-slate-300 dark:text-slate-600 hover:text-maroon-600 dark:hover:text-maroon-400 min-h-[36px] transition-colors">
            + Add your intro, phone, email &amp; city
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Participation card ───────────────────────────────────────────────────────

// How this member takes part (admin-set), plus what it means for role sign-ups
// while the online-only reservation window is switched on.
function ParticipationCard({ member, meetings }: { member: Member; meetings: MeetingWithClaims[] }) {
  const supabase = createClient();
  const [mode, setMode] = useState<ParticipationMode | null>(null);
  const [reservation, setReservation] = useState({ enabled: false, daysBefore: DEFAULT_RESERVATION_DAYS_BEFORE });
  const [offlineReservation, setOfflineReservation] = useState({ enabled: false, daysBefore: DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE });

  useEffect(() => {
    supabase.from('members').select('participation_mode').eq('id', member.id).maybeSingle()
      .then(({ data, error }) => { if (!error) setMode(participationMode(data ?? {})); });
    supabase.from('agenda_config').select('online_reservation_enabled, online_reservation_days_before').single()
      .then(({ data }) => {
        if (!data) return;
        setReservation({
          enabled: data.online_reservation_enabled === true,
          daysBefore: data.online_reservation_days_before ?? DEFAULT_RESERVATION_DAYS_BEFORE,
        });
      });
    // Read on its own so a club still on migration 051 just sees the gate off.
    supabase.from('agenda_config').select('offline_reservation_enabled, offline_reservation_days_before').single()
      .then(({ data }) => {
        if (!data) return;
        setOfflineReservation({
          enabled: data.offline_reservation_enabled === true,
          daysBefore: data.offline_reservation_days_before ?? DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE,
        });
      });
  }, [member.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing useful to show until the column has actually been read.
  if (!mode) return null;

  const meta = participationModeMeta(mode);
  const days = reservation.daysBefore;

  // The next meeting still inside its reservation window — lets an in-person
  // member see exactly when they can start claiming, not just the general rule.
  const nextMeeting = meetings.filter((m) => !isMeetingPast(m)).sort((a, b) => a.number - b.number)[0] ?? null;
  const nextWindow = nextMeeting ? roleReservation(nextMeeting, reservation.enabled, days) : null;
  const heldBack = mode === 'hybrid' && !!nextWindow?.active && !!nextMeeting;

  // WIC India members answer to their own, later, window instead.
  const isWic = mode === 'offline';
  const wicWindow = nextMeeting
    ? offlineClaimWindow(nextMeeting, offlineReservation.enabled, offlineReservation.daysBefore)
    : null;
  const wicHeldBack = isWic && !!wicWindow?.active && !!nextMeeting;

  // Tense-correct tail for the "how it works" line: the next meeting may already
  // be past its opening day.
  const nextOpening = nextMeeting && nextWindow
    ? (nextWindow.active
        ? <> — for Meeting #{nextMeeting.number} that&apos;s{' '}
            <strong className="text-slate-700 dark:text-slate-300">{formatMeetingDate(nextWindow.opensOn)}</strong>.</>
        : <> — Meeting #{nextMeeting.number} is already open to everyone.</>)
    : <> a few days before each meeting.</>;

  return (
    <div className={cardCls}>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
        🌐 How You Participate
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${
          mode === 'online'
            ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50'
            : mode === 'offline'
              ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50'
              : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
        }`}>
          {meta.emoji} {meta.label}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{meta.hint}</span>
      </div>

      {isWic && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-3">
          You&apos;re a member of <strong className="text-violet-700 dark:text-violet-400">{WIC_CLUB_NAME}</strong>,
          taking part in {HOME_CLUB_NAME} meetings.
        </p>
      )}

      {wicHeldBack && nextMeeting && wicWindow && (
        <div className="mt-3 rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/25 px-3 py-2.5">
          <p className="text-xs font-bold text-violet-800 dark:text-violet-300">
            🔒 Role sign-up for Meeting #{nextMeeting.number} isn&apos;t open to you yet
          </p>
          <p className="text-xs text-violet-700 dark:text-violet-400/90 leading-relaxed mt-1">
            {HOME_CLUB_NAME} members get first pick. Yours open{' '}
            <strong>{reservationCountdown(wicWindow)}</strong> — on{' '}
            <strong>{formatMeetingDate(wicWindow.opensOn)}</strong>, for the meeting on{' '}
            {formatMeetingDate(nextMeeting.date)}. Until then you can request a role from the
            meeting card and an officer will assign it.
          </p>
        </div>
      )}

      {heldBack && nextMeeting && nextWindow && (
        <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/25 px-3 py-2.5">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
            🔒 Role sign-up for Meeting #{nextMeeting.number} isn&apos;t open to you yet
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed mt-1">
            Roles go to online-only members first. Yours open{' '}
            <strong>{reservationCountdown(nextWindow)}</strong> — on{' '}
            <strong>{formatMeetingDate(nextWindow.opensOn)}</strong>, for the meeting on{' '}
            {formatMeetingDate(nextMeeting.date)}.
          </p>
        </div>
      )}

      {isWic && offlineReservation.enabled && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          Roles open to {WIC_CLUB_NAME} members{' '}
          <strong className="text-slate-600 dark:text-slate-300">
            {offlineReservation.daysBefore} {offlineReservation.daysBefore === 1 ? 'day' : 'days'}
          </strong>{' '}
          before each meeting, once the home club has had first pick. You can&apos;t take the same
          role in two meetings in a row.
        </p>
      )}

      {!isWic && reservation.enabled && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {mode === 'online' ? (
            <>
              <strong className="text-emerald-700 dark:text-emerald-400">You get first pick of meeting roles.</strong>{' '}
              Every role is held for online-only members from the moment a meeting is created, then opens to the
              whole club{nextOpening}
            </>
          ) : (
            <>
              Roles are reserved for members who attend online only, then open to everyone{nextOpening}
            </>
          )}{' '}
          Either way, you can&apos;t take the same role in two meetings in a row.
        </p>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
        Set by the club — contact the <strong className="text-slate-500 dark:text-slate-400">President</strong> or{' '}
        <strong className="text-slate-500 dark:text-slate-400">VP Education</strong> to change it.
      </p>
    </div>
  );
}

// ─── Password card ────────────────────────────────────────────────────────────

function PasswordCard({ member }: { member: Member }) {
  const supabase = createClient();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'idle' | 'set' | 'change' | 'remove'>('idle');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.from('members').select('password_hash').eq('id', member.id).single()
      .then(({ data }) => setHasPassword(!!data?.password_hash));
  }, [member.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() { setCurrentPw(''); setNewPw(''); setConfirmPw(''); setError(''); setSaving(false); setMode('idle'); }

  async function handleRemovePassword() {
    setError('');
    if (!currentPw) { setError('Enter your current password to confirm removal.'); return; }
    setSaving(true);
    const { data } = await supabase.from('members').select('password_hash, password_salt').eq('id', member.id).single();
    if (!data?.password_hash || !data?.password_salt) { setSaving(false); reset(); return; }
    const valid = await verifyPassword(currentPw, data.password_salt, data.password_hash);
    if (!valid) { setError('Incorrect password.'); setSaving(false); return; }
    await supabase.from('members').update({ password_hash: null, password_salt: null }).eq('id', member.id);
    setSaving(false);
    setHasPassword(false);
    reset();
  }

  async function handleSave() {
    setError('');
    if (newPw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setSaving(true);
    if (mode === 'change') {
      const { data } = await supabase.from('members').select('password_hash, password_salt').eq('id', member.id).single();
      if (!data?.password_hash || !data?.password_salt) { setSaving(false); reset(); return; }
      const valid = await verifyPassword(currentPw, data.password_salt, data.password_hash);
      if (!valid) { setError('Current password is incorrect.'); setSaving(false); return; }
    }
    const salt = generateSalt();
    const hash = await hashPassword(newPw, salt);
    await supabase.from('members').update({ password_hash: hash, password_salt: salt }).eq('id', member.id);
    setSaving(false);
    setHasPassword(true);
    setDone(true);
    setMode('idle');
    reset();
  }

  if (hasPassword === null) return null;

  return (
    <div className={cardCls}>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">🔒 Password</p>

      {done && <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-3">Password saved successfully.</p>}

      {!hasPassword && mode === 'idle' && (
        <div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 mb-3">
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              ⚠️ <strong>Your profile is unprotected.</strong> Anyone who knows your name could sign in as you.
            </p>
          </div>
          <button onClick={() => { setDone(false); setMode('set'); }}
            className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                       text-white rounded-xl py-3 text-sm font-semibold min-h-[44px] active:scale-95 transition-all shadow-sm">
            Set a Password
          </button>
        </div>
      )}

      {hasPassword && mode === 'idle' && (
        <div className="space-y-2">
          {!done && <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Your account is password protected.</p>}
          {[
            { action: () => { setDone(false); setMode('change'); }, title: 'Change Password', sub: 'Update your current password', danger: false },
            { action: () => { setDone(false); setMode('remove'); }, title: 'Remove Password', sub: 'Leave your profile unprotected', danger: true },
          ].map((item) => (
            <button key={item.title} onClick={item.action}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors min-h-[52px] group
                bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50
                ${item.danger
                  ? 'hover:border-red-200 dark:hover:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-950/20'
                  : 'hover:border-maroon-200 dark:hover:border-maroon-800/50 hover:bg-maroon-50 dark:hover:bg-maroon-950/20'}`}>
              <div className="text-left">
                <p className={`text-sm font-semibold text-slate-800 dark:text-slate-200 ${item.danger ? 'group-hover:text-red-600 dark:group-hover:text-red-400' : 'group-hover:text-maroon-700 dark:group-hover:text-maroon-400'}`}>
                  {item.title}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{item.sub}</p>
              </div>
              <span className={`text-slate-300 dark:text-slate-600 text-lg ${item.danger ? 'group-hover:text-red-400' : 'group-hover:text-maroon-400'}`}>›</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'remove' && (
        <div className="space-y-2">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl p-3">
            <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
              ⚠️ <strong>This will remove password protection.</strong> Enter your current password to confirm.
            </p>
          </div>
          <input type="password" value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRemovePassword(); }}
            placeholder="Current password" autoFocus className={inputCls} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={handleRemovePassword} disabled={saving || !currentPw}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all">
              {saving ? 'Removing…' : 'Remove Password'}
            </button>
            <button onClick={reset} className="px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {(mode === 'set' || mode === 'change') && (
        <div className="space-y-2">
          {mode === 'change' && (
            <input type="password" value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); setError(''); }}
              placeholder="Current password" className={inputCls} />
          )}
          <input type="password" value={newPw} onChange={(e) => { setNewPw(e.target.value); setError(''); }}
            placeholder="New password (min 6 characters)" autoFocus className={inputCls} />
          <input type="password" value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            placeholder="Confirm new password" className={inputCls} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className={primaryBtnCls}>
              {saving ? 'Saving…' : 'Save Password'}
            </button>
            <button onClick={reset} className="px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 min-h-[44px]">
              Cancel
            </button>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mt-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              🔒 <strong>Forgot your password?</strong> Contact <strong>TM Manish Singh</strong> to hard reset it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

// ─── Roster card ──────────────────────────────────────────────────────────────

// One card of people with their photo, city and intro. Used twice: our own club
// members, and the visiting WIC India club shown the same way beneath them.
function MemberDirectory({ title, members, note }: {
  title: string;
  members: Member[];
  note?: string;
}) {
  if (members.length === 0) return null;
  return (
    <div className={cardCls}>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
        {title}
      </p>
      {note && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed -mt-1 mb-3">{note}</p>
      )}
      <div className="space-y-3">
        {members.map((m, i) => (
          <div key={m.id} className={i > 0 ? 'pt-3 border-t border-slate-100 dark:border-slate-800' : ''}>
            <div className="flex items-start gap-3">
              <MemberAvatar member={m} size={36} className="mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">TM {m.display_name}</p>
                  {memberLeadershipRoles(m).map((role) => (
                    <span key={role} className="text-[9px] font-semibold bg-gradient-to-r from-maroon-700 to-maroon-600
                                     text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {leadershipLabel(role)}
                    </span>
                  ))}
                </div>
                {m.city && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">📍 {m.city}</p>}
                {m.introduction ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-1 leading-relaxed">
                    &ldquo;{m.introduction}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-0.5 italic">No intro yet</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemberDashboard({ member, allMembers, meetings, onUpdated }: Props) {
  const supabase = createClient();
  const wicMemberIds = useWicMemberIds();
  // Mentoring is a club programme and WIC members aren't in it, so their own
  // dashboard shows neither a mentor nor mentees.
  const isWicMember = wicMemberIds.has(member.id);
  const mentor  = member.mentor_id ? allMembers.find((m) => m.id === member.mentor_id) : null;
  const mentees = isWicMember ? [] : allMembers.filter((m) => m.mentor_id === member.id && m.active);

  const isOfficer = isClubOfficer(member);
  const [myRequests, setMyRequests] = useState<(SpeakerSlotRequest & { meeting_number?: number; meeting_date?: string; reviewer_name?: string })[]>([]);
  const [myEvalRequests, setMyEvalRequests] = useState<(EvaluatorRequest & { meeting_number?: number; meeting_date?: string; evaluator_name?: string; reviewer_name?: string; _past?: boolean })[]>([]);
  const [myRoleRequests, setMyRoleRequests] = useState<(RoleInterestRequest & { meeting_number?: number; meeting_date?: string; reviewer_name?: string })[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [myResults, setMyResults] = useState<(ContestResult & { meeting_number?: number; group_name?: string | null; show_ranking?: boolean })[]>([]);

  // Meetings this member is judging (jury) that haven't happened yet.
  const judgingMeetings = meetings
    .filter((m) => !isMeetingPast(m) && m.role_claims.some((c) => c.role_key === 'jury' && c.member_id === member.id))
    .sort((a, b) => a.number - b.number);

  useEffect(() => {
    // My own requests
    supabase.from('speaker_slot_requests').select('*')
      .eq('member_id', member.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const enriched = data
          .map(r => {
            const m = meetings.find(mt => mt.id === r.meeting_id);
            const reviewer = r.reviewer_id ? allMembers.find(mb => mb.id === r.reviewer_id) : null;
            return { ...r, meeting_number: m?.number, meeting_date: m?.date, _past: m ? isMeetingPast(m) : true, reviewer_name: reviewer?.display_name };
          })
          .filter(r => !r._past);
        setMyRequests(enriched);
      });
    // My evaluator nominations (as the speaker). Keep upcoming ones plus any that
    // stayed pending past the meeting (shown as "no action taken").
    supabase.from('evaluator_requests').select('*')
      .eq('speaker_id', member.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const enriched = (data as EvaluatorRequest[])
          .map(r => {
            const m = meetings.find(mt => mt.id === r.meeting_id);
            const evaluator = allMembers.find(mb => mb.id === r.preferred_evaluator_id);
            const reviewer = r.reviewer_id ? allMembers.find(mb => mb.id === r.reviewer_id) : null;
            return { ...r, meeting_number: m?.number, meeting_date: m?.date, evaluator_name: evaluator?.display_name, reviewer_name: reviewer?.display_name, _past: m ? isMeetingPast(m) : true };
          })
          .filter(r => r.status !== 'cancelled' && (!r._past || r.status === 'pending'));
        setMyEvalRequests(enriched);
      });
    // My role requests, raised while the reservation window blocked direct claims.
    supabase.from('role_interest_requests').select('*')
      .eq('member_id', member.id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return;
        const enriched = (data as RoleInterestRequest[])
          .map(r => {
            const m = meetings.find(mt => mt.id === r.meeting_id);
            const reviewer = r.reviewer_id ? allMembers.find(mb => mb.id === r.reviewer_id) : null;
            return { ...r, meeting_number: m?.number, meeting_date: m?.date, reviewer_name: reviewer?.display_name, _past: m ? isMeetingPast(m) : true };
          })
          .filter(r => r.status !== 'cancelled' && !r._past);
        setMyRoleRequests(enriched);
      });
    // Pending count for officers (speaker-slot + evaluator + role requests)
    if (isOfficer) {
      Promise.all([
        supabase.from('speaker_slot_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('evaluator_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('role_interest_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]).then(([a, b, c]) => setPendingCount((a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0)));
    }
    // Contest results revealed to this member
    supabase.from('contest_results').select('*')
      .eq('contestant_member_id', member.id).eq('revealed', true)
      .then(({ data }) => {
        if (!data) return;
        const enriched = (data as ContestResult[]).map((r) => {
          const m = meetings.find((mt) => mt.id === r.meeting_id);
          let group_name: string | null = null;
          if (m) {
            const spk = m.role_claims.find((c) => c.role_key === 'speaker' && c.member_id === member.id);
            const gid = spk ? groupIdForSlot(m, spk.slot_index) : null;
            group_name = gid ? (m.speaker_groups.find((g) => g.id === gid)?.name ?? null) : null;
          }
          return { ...r, meeting_number: m?.number, group_name, show_ranking: m?.contest_show_ranking ?? true };
        });
        setMyResults(enriched);
      });
  }, [member.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const allActivity = getMemberRecentRoles(meetings.filter(isMeetingPast), member.id, 50);
  const recentActivity = allActivity.slice(0, 8);
  const totalRoles = allActivity.reduce((sum, { roles }) => sum + roles.length, 0);
  // Our club's roster and the visiting club's, listed separately: WIC India
  // members take part in meetings but aren't members of this club.
  const otherActive = allMembers.filter((m) => m.active && m.id !== member.id);
  const otherMembers   = otherActive.filter((m) => !wicMemberIds.has(m.id));
  const wicClubMembers = otherActive.filter((m) => wicMemberIds.has(m.id));

  const sectionLabel = (text: string) => (
    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{text}</p>
  );

  return (
    <div className="space-y-4 pb-8">

      {/* Pending slot requests banner for president / VP Ed */}
      {isOfficer && pendingCount > 0 && (
        <Link href="/amiadmin"
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl
                     bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50
                     hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors group">
          <span className="text-2xl shrink-0">🎙️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              {pendingCount} member request{pendingCount > 1 ? 's' : ''} pending review
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Tap to open admin panel → Requests</p>
          </div>
          <span className="text-amber-400 dark:text-amber-600 text-lg group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      )}

      {/* Jury judging link(s) */}
      {judgingMeetings.map((m) => (
        <Link key={m.id} href={`/judge/${m.id}`}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl
                     bg-maroon-50 dark:bg-maroon-950/30 border border-maroon-300 dark:border-maroon-800/50
                     hover:bg-maroon-100 dark:hover:bg-maroon-950/50 transition-colors group">
          <span className="text-2xl shrink-0">🧑‍⚖️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-maroon-800 dark:text-maroon-300">You’re a judge for Meeting #{m.number}</p>
            <p className="text-xs text-maroon-600 dark:text-maroon-500 mt-0.5">Tap to score the contestants →</p>
          </div>
          <span className="text-maroon-400 dark:text-maroon-600 text-lg group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      ))}

      {/* Contest results revealed to this member */}
      {myResults.map((r) => (
        <div key={r.id} className={cardCls}>
          {sectionLabel('🏆 Your Contest Result')}
          <div className="flex items-end justify-between mb-3">
            <div>
              {r.meeting_number && <p className="text-xs text-slate-400 dark:text-slate-500">Meeting #{r.meeting_number}{r.group_name ? ` · ${r.group_name}` : ''}</p>}
              {r.show_ranking && r.rank != null && (
                <p className="text-lg font-black text-maroon-700 dark:text-maroon-400">
                  {ordinal(r.rank)}{r.group_name ? ` in ${r.group_name}` : ' place'}
                </p>
              )}
              {r.show_ranking && r.group_name && r.overall_rank != null && (
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{ordinal(r.overall_rank)} overall</p>
              )}
            </div>
            <p className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">
              {Number(r.final_score)}<span className="text-base font-medium text-slate-400"> / {RUBRIC_TOTAL}</span>
            </p>
          </div>
          <div className="space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
            {CONTEST_RUBRIC.map((item) => (
              <div key={item.key} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
                <span className="tabular-nums text-slate-800 dark:text-slate-100">
                  {r.item_avgs?.[item.key] ?? 0} <span className="text-slate-400 text-xs">/ {item.max}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <ProfileCard member={member} onUpdated={onUpdated} />

      {/* How this member takes part — drives the role reservation window */}
      <ParticipationCard member={member} meetings={meetings} />

      {/* Surveys */}
      <SurveyLinks memberId={member.id} />

      {/* Upcoming roles */}
      {(() => {
        const upcoming = meetings
          .filter(m => !isMeetingPast(m))
          .sort((a, b) => a.number - b.number)
          .flatMap(m => {
            const claims = m.role_claims.filter(c => c.member_id === member.id);
            if (!claims.length) return [];
            return [{ meeting: m, roles: claims.map(c => c.role_key as RoleKey) }];
          });

        if (!upcoming.length) return null;

        return (
          <div className={cardCls}>
            {sectionLabel('📅 Your Upcoming Roles')}
            <div className="space-y-3">
              {upcoming.map(({ meeting, roles }) => (
                <div key={meeting.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-maroon-50 dark:bg-maroon-950/20 border border-maroon-100 dark:border-maroon-900/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Meeting #{meeting.number} · {formatMeetingDate(meeting.date)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {roles.map((r, i) => (
                        <span key={`${r}-${i}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold
                                     bg-white dark:bg-maroon-950/60 text-maroon-700 dark:text-maroon-300
                                     border border-maroon-200 dark:border-maroon-800/60
                                     rounded-full px-2.5 py-0.5">
                          {ROLE_META[r].emoji} {ROLE_META[r].label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              New to this role?{' '}
              <a
                href="https://www.toastmasters.org/membership/club-meeting-roles"
                target="_blank"
                rel="noopener noreferrer"
                className="text-maroon-600 dark:text-maroon-400 hover:underline font-medium"
              >
                Learn more about club meeting roles ↗
              </a>
            </p>
          </div>
        );
      })()}

      {/* My role requests (raised during the reservation window) */}
      {myRoleRequests.length > 0 && (
        <div className={cardCls}>
          {sectionLabel('🙋 Your Role Requests')}
          <div className="space-y-2">
            {myRoleRequests.map(r => {
              const meta = ROLE_META[r.role_key];
              return (
                <div key={r.id} className={`rounded-xl px-3 py-2.5 border text-xs ${
                  r.status === 'pending'
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                    : r.status === 'approved'
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-bold ${
                        r.status === 'pending' ? 'text-amber-700 dark:text-amber-400'
                        : r.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                      }`}>
                        {r.status === 'pending'  && '⏳ Awaiting approval'}
                        {r.status === 'approved' && '✓ Approved'}
                        {r.status === 'denied'   && '✗ Declined'}
                        {r.meeting_number ? ` · Meeting #${r.meeting_number}` : ''}
                      </p>
                      <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                        You asked to play{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">{meta.emoji} {meta.label}</span>
                      </p>
                      {r.request_note && <p className="mt-0.5 text-slate-500 dark:text-slate-400">Your note: {r.request_note}</p>}
                      {r.review_comment && (
                        <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400">Club Officer notes{r.reviewer_name ? ` (TM ${r.reviewer_name})` : ''}:</span>{' '}{r.review_comment}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-slate-400 dark:text-slate-600">
                      {r.meeting_date ? new Date(r.meeting_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My speaker slot requests */}
      {myRequests.length > 0 && (
        <div className={cardCls}>
          {sectionLabel('🎙️ Speaker Slot Requests')}
          <div className="space-y-2">
            {myRequests.map(r => (
              <div key={r.id} className={`rounded-xl px-3 py-2.5 border text-xs ${
                r.status === 'pending'
                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                  : r.status === 'approved'
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-bold ${
                      r.status === 'pending' ? 'text-amber-700 dark:text-amber-400'
                      : r.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                    }`}>
                      {r.status === 'pending' && '⏳ Pending'}
                      {r.status === 'approved' && '✓ Approved'}
                      {r.status === 'denied' && '✗ Denied'}
                      {r.meeting_number ? ` · Meeting #${r.meeting_number}` : ''}
                    </p>
                    {r.request_note && <p className="mt-0.5 text-slate-500 dark:text-slate-400">Your note: {r.request_note}</p>}
                    {r.review_comment && (
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">Club Officer notes{r.reviewer_name ? ` (TM ${r.reviewer_name})` : ''}:</span>{' '}{r.review_comment}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-slate-400 dark:text-slate-600">
                    {r.meeting_date ? new Date(r.meeting_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My evaluator requests (who I asked to evaluate me) */}
      {myEvalRequests.length > 0 && (
        <div className={cardCls}>
          {sectionLabel('⚖️ Your Evaluator Requests')}
          <div className="space-y-2">
            {myEvalRequests.map(r => {
              // A request left pending once the meeting is over is treated as
              // "no action taken" rather than an open pending state.
              const noAction = r.status === 'pending' && r._past;
              const tone = noAction
                ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50'
                : r.status === 'pending'
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                : r.status === 'approved'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40';
              const textTone = noAction
                ? 'text-slate-500 dark:text-slate-400'
                : r.status === 'pending' ? 'text-amber-700 dark:text-amber-400'
                : r.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400';
              return (
                <div key={r.id} className={`rounded-xl px-3 py-2.5 border text-xs ${tone}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-bold ${textTone}`}>
                        {noAction && '🚫 No action taken'}
                        {!noAction && r.status === 'pending' && '⏳ Pending approval'}
                        {!noAction && r.status === 'approved' && '✓ Approved'}
                        {!noAction && r.status === 'denied' && '✗ Denied'}
                        {r.meeting_number ? ` · Meeting #${r.meeting_number}` : ''}
                      </p>
                      <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                        You requested <span className="font-medium text-slate-700 dark:text-slate-300">TM {r.evaluator_name ?? '—'}</span> as your evaluator
                      </p>
                      {r.review_comment && (
                        <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400">Club Officer notes{r.reviewer_name ? ` (TM ${r.reviewer_name})` : ''}:</span>{' '}{r.review_comment}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-slate-400 dark:text-slate-600">
                      {r.meeting_date ? new Date(r.meeting_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PasswordCard member={member} />

      {/* Mentor — a club programme, so not shown to visiting WIC members. */}
      {!isWicMember && (
      <div className={cardCls}>
        {sectionLabel('🤝 Your Mentor')}
        {mentor ? (
          <div className="flex items-start gap-3">
            <MemberAvatar member={mentor} size={40} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-white">TM {mentor.display_name}</p>
              {mentor.city && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">📍 {mentor.city}</p>}
              {mentor.introduction && (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic mt-2 leading-relaxed">
                  &ldquo;{mentor.introduction}&rdquo;
                </p>
              )}
              {mentor.phone && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">📞 {mentor.phone}</p>}
              {mentor.email && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">✉️ {mentor.email}</p>}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No mentor assigned yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              Contact the <strong className="text-slate-600 dark:text-slate-300">Club President</strong> or{' '}
              <strong className="text-slate-600 dark:text-slate-300">VP Education</strong> to get a mentor assigned.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Mentees */}
      {mentees.length > 0 && (
        <div className={cardCls}>
          {sectionLabel(`🌱 Your Mentee${mentees.length > 1 ? 's' : ''}`)}
          <div className="space-y-3">
            {mentees.map((m, i) => (
              <div key={m.id} className={i > 0 ? 'pt-3 border-t border-slate-100 dark:border-slate-800' : ''}>
                <div className="flex items-start gap-3">
                  <MemberAvatar member={m} size={36} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900 dark:text-white">TM {m.display_name}</p>
                    {m.city && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">📍 {m.city}</p>}
                    {m.introduction && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 italic mt-1.5 leading-relaxed">
                        &ldquo;{m.introduction}&rdquo;
                      </p>
                    )}
                    {m.phone && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">📞 {m.phone}</p>}
                    {m.email && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">✉️ {m.email}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      <div className={cardCls}>
        {sectionLabel('📊 Club Activity')}
        {allActivity.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No roles on record yet. Claim one to get started!</p>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-maroon-700 dark:text-maroon-400">{allActivity.length}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Meetings</p>
              </div>
              <div className="w-px bg-slate-100 dark:bg-slate-800" />
              <div className="text-center">
                <p className="text-2xl font-bold text-maroon-700 dark:text-maroon-400">{totalRoles}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Roles</p>
              </div>
            </div>
            <div className="space-y-2">
              {recentActivity.map(({ meeting, roles }) => (
                <div key={meeting.id} className="flex items-start gap-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Meeting #{meeting.number}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{formatMeetingDate(meeting.date)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[55%]">
                    {(roles as RoleKey[]).map((r, i) => (
                      <span key={`${r}-${i}`}
                        className="text-[10px] font-medium text-maroon-700 dark:text-maroon-400
                                   bg-maroon-50 dark:bg-maroon-950/30
                                   border border-maroon-100 dark:border-maroon-900/50
                                   rounded-full px-2 py-0.5 whitespace-nowrap">
                        {ROLE_META[r].emoji} {ROLE_META[r].label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {allActivity.length > 8 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-1">
                  + {allActivity.length - 8} more meetings
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Our club's roster, then the visiting club below it. */}
      <MemberDirectory title={`👥 Club Members (${otherMembers.length})`} members={otherMembers} />
      <MemberDirectory
        title={`🤝 ${WIC_CLUB_NAME} (${wicClubMembers.length})`}
        members={wicClubMembers}
        note="They take part in our meetings and hold roles, but are members of their own club."
      />
    </div>
  );
}
