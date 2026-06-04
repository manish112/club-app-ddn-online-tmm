'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member, MeetingWithClaims, RoleKey } from '@/lib/types';
import { ROLE_META, LEADERSHIP_ROLES } from '@/lib/types';
import { getMemberRecentRoles, formatMeetingDate } from '@/lib/utils';
import { MemberAvatar } from '@/components/MemberAvatar';
import { AvatarCropModal } from '@/components/AvatarCropModal';

interface Props {
  member: Member;
  allMembers: Member[];
  meetings: MeetingWithClaims[];
  onUpdated: () => void;
}

function leadershipLabel(role: string | null) {
  return LEADERSHIP_ROLES.find((r) => r.value === role)?.label ?? null;
}

// ─── Profile card (editable) ──────────────────────────────────────────────────

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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleCropSave(blob: Blob) {
    setCropSrc(null);
    setUploading(true);
    const { error } = await supabase.storage
      .from('member-avatars')
      .upload(member.id, blob, { upsert: true, contentType: 'image/jpeg' });
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
      city:  city.trim()  || null,
      gender: gender || null,
      show_phone_in_contact: showPhone,
    }).eq('id', member.id);
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
    return (
      <AvatarCropModal
        imageSrc={cropSrc}
        onSave={handleCropSave}
        onClose={() => setCropSrc(null)}
      />
    );
  }

  if (editing) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
        <h3 className="font-serif text-base font-semibold text-stone-900 mb-4">Edit Profile</h3>
        <form onSubmit={save} className="space-y-3">

          {/* Photo upload */}
          <div className="flex items-center gap-4">
            <MemberAvatar member={previewMember} size={64} />
            <div>
              <label className={`cursor-pointer text-sm font-medium tap-target ${
                uploading ? 'text-stone-300 pointer-events-none' : 'text-maroon-600 hover:text-maroon-800'
              }`}>
                {uploading ? 'Uploading…' : 'Change Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handlePhotoChange}
                  disabled={uploading}
                />
              </label>
              <p className="text-[10px] text-stone-400 mt-0.5">JPEG or PNG · max 2 MB</p>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as typeof gender)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800
                         focus:outline-none focus:ring-2 focus:ring-maroon-700 bg-white"
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Introduction */}
          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Introduction</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="A short intro about yourself…"
              rows={3}
              maxLength={300}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800
                         resize-none focus:outline-none focus:ring-2 focus:ring-maroon-700
                         placeholder:text-stone-300"
            />
            <p className="text-right text-[10px] text-stone-300 -mt-1">{intro.length}/300</p>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800
                         focus:outline-none focus:ring-2 focus:ring-maroon-700 placeholder:text-stone-300" />
            {member.leadership_role && phone.trim() && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPhone}
                  onChange={(e) => setShowPhone(e.target.checked)}
                  className="w-4 h-4 accent-maroon-700 rounded"
                />
                <span className="text-xs text-stone-500">Show my phone number in Contact Us</span>
              </label>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800
                         focus:outline-none focus:ring-2 focus:ring-maroon-700 placeholder:text-stone-300" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">City</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="Dehradun"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800
                         focus:outline-none focus:ring-2 focus:ring-maroon-700 placeholder:text-stone-300" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || uploading}
              className="flex-1 bg-maroon-700 text-white rounded-xl py-2.5 text-sm font-semibold
                         tap-target disabled:opacity-40 active:scale-95 transition-transform">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={cancel}
              className="px-5 py-2.5 text-sm text-stone-400 hover:text-stone-700 tap-target">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={previewMember} size={56} />
          <div>
            <p className="text-lg font-bold text-stone-900 font-serif">TM {member.display_name}</p>
            <p className="text-xs text-stone-400">{member.name}</p>
            {member.leadership_role && (
              <span className="inline-block mt-1.5 text-[10px] font-semibold bg-maroon-700 text-white
                               px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {leadershipLabel(member.leadership_role)}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setEditing(true)}
          className="text-xs text-maroon-600 font-medium hover:text-maroon-800 tap-target shrink-0">
          Edit ▸
        </button>
      </div>

      {member.introduction && (
        <p className="text-sm text-stone-600 italic leading-relaxed mb-3 pb-3 border-b border-stone-100">
          &ldquo;{member.introduction}&rdquo;
        </p>
      )}

      <div className="space-y-1.5">
        {member.city && (
          <div className="flex items-center gap-2">
            <span className="text-base">📍</span>
            <span className="text-sm text-stone-700">{member.city}</span>
          </div>
        )}
        {member.email && (
          <div className="flex items-center gap-2">
            <span className="text-base">✉️</span>
            <span className="text-sm text-stone-700">{member.email}</span>
          </div>
        )}
        {member.phone && (
          <div className="flex items-center gap-2">
            <span className="text-base">📞</span>
            <span className="text-sm text-stone-700">{member.phone}</span>
          </div>
        )}
        {!member.city && !member.email && !member.phone && !member.introduction && (
          <button onClick={() => setEditing(true)}
            className="text-sm text-stone-300 hover:text-maroon-600 tap-target transition-colors">
            + Add your intro, phone, email &amp; city
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function MemberDashboard({ member, allMembers, meetings, onUpdated }: Props) {
  const mentor  = member.mentor_id ? allMembers.find((m) => m.id === member.mentor_id) : null;
  const mentees = allMembers.filter((m) => m.mentor_id === member.id && m.active);

  const allActivity = getMemberRecentRoles(meetings, member.id, 50);
  const recentActivity = allActivity.slice(0, 8);
  const totalRoles = allActivity.reduce((sum, { roles }) => sum + roles.length, 0);

  const otherMembers = allMembers.filter((m) => m.active && m.id !== member.id);

  return (
    <div className="space-y-4 pb-8">

      {/* ── Profile ── */}
      <ProfileCard member={member} onUpdated={onUpdated} />

      {/* ── Mentor ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">🤝 Your Mentor</p>
        {mentor ? (
          <div className="flex items-start gap-3">
            <MemberAvatar member={mentor} size={40} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-bold text-stone-900">TM {mentor.display_name}</p>
              {mentor.city && <p className="text-xs text-stone-400 mt-0.5">📍 {mentor.city}</p>}
              {mentor.introduction && (
                <p className="text-sm text-stone-500 italic mt-2 leading-relaxed">
                  &ldquo;{mentor.introduction}&rdquo;
                </p>
              )}
              {mentor.phone && (
                <p className="text-sm text-stone-600 mt-2">📞 {mentor.phone}</p>
              )}
              {mentor.email && (
                <p className="text-sm text-stone-600 mt-1">✉️ {mentor.email}</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-stone-500 mb-1">No mentor assigned yet.</p>
            <p className="text-xs text-stone-400 leading-relaxed">
              Contact the <strong className="text-stone-600">Club President</strong> or{' '}
              <strong className="text-stone-600">VP Education</strong> to get a mentor assigned.
            </p>
          </div>
        )}
      </div>

      {/* ── Mentees ── */}
      {mentees.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">
            🌱 Your Mentee{mentees.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-3">
            {mentees.map((m, i) => (
              <div key={m.id} className={i > 0 ? 'pt-3 border-t border-stone-100' : ''}>
                <div className="flex items-start gap-3">
                  <MemberAvatar member={m} size={36} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-stone-900">TM {m.display_name}</p>
                    {m.city && <p className="text-xs text-stone-400 mt-0.5">📍 {m.city}</p>}
                    {m.introduction && (
                      <p className="text-sm text-stone-500 italic mt-1.5 leading-relaxed">
                        &ldquo;{m.introduction}&rdquo;
                      </p>
                    )}
                    {m.phone && <p className="text-sm text-stone-600 mt-1.5">📞 {m.phone}</p>}
                    {m.email && <p className="text-sm text-stone-600 mt-0.5">✉️ {m.email}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Club Activity ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">📊 Club Activity</p>
        {allActivity.length === 0 ? (
          <p className="text-sm text-stone-400">No roles on record yet. Claim one to get started!</p>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-maroon-700">{allActivity.length}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-widest">Meetings</p>
              </div>
              <div className="w-px bg-stone-100" />
              <div className="text-center">
                <p className="text-2xl font-bold text-maroon-700">{totalRoles}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-widest">Roles</p>
              </div>
            </div>
            <div className="space-y-2">
              {recentActivity.map(({ meeting, roles }) => (
                <div key={meeting.id} className="flex items-start gap-3 py-2 px-3 rounded-xl bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-700">Meeting #{meeting.number}</p>
                    <p className="text-[10px] text-stone-400">{formatMeetingDate(meeting.date)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[55%]">
                    {(roles as RoleKey[]).map((r, i) => (
                      <span key={`${r}-${i}`}
                        className="text-[10px] font-medium text-maroon-700 bg-maroon-50
                                   border border-maroon-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                        {ROLE_META[r].emoji} {ROLE_META[r].label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {allActivity.length > 8 && (
                <p className="text-xs text-stone-400 text-center pt-1">
                  + {allActivity.length - 8} more meetings
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Club Members ── */}
      {otherMembers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">
            👥 Club Members ({otherMembers.length})
          </p>
          <div className="space-y-3">
            {otherMembers.map((m, i) => (
              <div key={m.id} className={i > 0 ? 'pt-3 border-t border-stone-100' : ''}>
                <div className="flex items-start gap-3">
                  <MemberAvatar member={m} size={36} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-stone-800">TM {m.display_name}</p>
                      {m.leadership_role && (
                        <span className="text-[9px] font-semibold bg-maroon-700 text-white
                                         px-2 py-0.5 rounded-full uppercase tracking-wide">
                          {leadershipLabel(m.leadership_role)}
                        </span>
                      )}
                    </div>
                    {m.city && <p className="text-xs text-stone-400 mt-0.5">📍 {m.city}</p>}
                    {m.introduction ? (
                      <p className="text-xs text-stone-500 italic mt-1 leading-relaxed">
                        &ldquo;{m.introduction}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-stone-300 mt-0.5 italic">No intro yet</p>
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
