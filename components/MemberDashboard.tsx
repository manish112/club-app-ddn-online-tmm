'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

import type { ContestResult, EvaluatorRequest, Member, MeetingWithClaims, RoleKey, SpeakerSlotRequest } from '@/lib/types';
import { ROLE_META, LEADERSHIP_ROLES, memberLeadershipRoles, isClubOfficer } from '@/lib/types';
import { SurveyLinks } from '@/components/SurveyLinks';
import { CONTEST_RUBRIC, RUBRIC_TOTAL } from '@/lib/contest';
import Link from 'next/link';
import { getMemberRecentRoles, formatMeetingDate, isMeetingPast, groupIdForSlot } from '@/lib/utils';
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

  // Read the saved preference on its own (isolated so a not-yet-migrated column
  // can never break the profile card).
  useEffect(() => {
    supabase.from('members').select('email_notifications').eq('id', member.id).maybeSingle()
      .then(({ data }) => { if (data && typeof data.email_notifications === 'boolean') setEmailPref(data.email_notifications); });
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
    // Save the email preference separately (best-effort — never blocks the profile save).
    await supabase.from('members').update({ email_notifications: emailPref }).eq('id', member.id);
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

export function MemberDashboard({ member, allMembers, meetings, onUpdated }: Props) {
  const supabase = createClient();
  const mentor  = member.mentor_id ? allMembers.find((m) => m.id === member.mentor_id) : null;
  const mentees = allMembers.filter((m) => m.mentor_id === member.id && m.active);

  const isOfficer = isClubOfficer(member);
  const [myRequests, setMyRequests] = useState<(SpeakerSlotRequest & { meeting_number?: number; meeting_date?: string; reviewer_name?: string })[]>([]);
  const [myEvalRequests, setMyEvalRequests] = useState<(EvaluatorRequest & { meeting_number?: number; meeting_date?: string; evaluator_name?: string; reviewer_name?: string; _past?: boolean })[]>([]);
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
    // Pending count for officers (speaker-slot + evaluator requests)
    if (isOfficer) {
      Promise.all([
        supabase.from('speaker_slot_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('evaluator_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]).then(([a, b]) => setPendingCount((a.count ?? 0) + (b.count ?? 0)));
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
  const otherMembers = allMembers.filter((m) => m.active && m.id !== member.id);

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
              {pendingCount} speaker slot request{pendingCount > 1 ? 's' : ''} pending review
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

      {/* Mentor */}
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

      {/* Club Members */}
      {otherMembers.length > 0 && (
        <div className={cardCls}>
          {sectionLabel(`👥 Club Members (${otherMembers.length})`)}
          <div className="space-y-3">
            {otherMembers.map((m, i) => (
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
      )}
    </div>
  );
}
