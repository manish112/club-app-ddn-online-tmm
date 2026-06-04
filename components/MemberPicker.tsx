'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member } from '@/lib/types';
import { MemberAvatar } from '@/components/MemberAvatar';
import { AvatarCropModal } from '@/components/AvatarCropModal';

interface Props {
  members: Member[];
  meetingId: string | null;
  onSelect: (id: string) => void;
  onGuest: () => void;
}

export function MemberPicker({ members, meetingId, onSelect, onGuest }: Props) {
  const supabase = createClient();
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState<'identify' | 'register' | 'intro'>('identify');

  // Guest registration
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [savingGuest, setSavingGuest] = useState(false);

  // Intro step
  const [intro, setIntro] = useState('');
  const [city, setCity] = useState('');
  const [savingIntro, setSavingIntro] = useState(false);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submitGuest(e: React.FormEvent) {
    e.preventDefault();
    setSavingGuest(true);
    await supabase.from('guest_registrations').insert({
      meeting_id: meetingId ?? null,
      name: guestName.trim() || null,
      phone: phone.trim(),
      email: email.trim(),
    });
    setSavingGuest(false);
    onGuest();
  }

  function handleThatSMe() {
    if (!selected) return;
    const member = members.find((m) => m.id === selected);
    if (member?.introduction && member?.city) {
      onSelect(selected);
      return;
    }
    setIntro(member?.introduction ?? '');
    setCity(member?.city ?? '');
    setStep('intro');
  }

  async function saveIntro() {
    setSavingIntro(true);
    await supabase
      .from('members')
      .update({ introduction: intro.trim() || null, city: city.trim() || null })
      .eq('id', selected);
    setSavingIntro(false);
    onSelect(selected);
  }

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
      .upload(selected, blob, { upsert: true, contentType: 'image/jpeg' });
    if (!error) {
      const { data } = supabase.storage.from('member-avatars').getPublicUrl(selected);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('members').update({ avatar_url: url }).eq('id', selected);
      setLocalAvatarUrl(url);
    }
    setUploading(false);
  }

  const selectedMember = members.find((m) => m.id === selected);
  const othersWithIntro = members.filter(
    (m) => m.id !== selected && m.active && m.introduction,
  );

  // ── Guest registration ────────────────────────────────────────────────────
  if (step === 'register') {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
          <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-6 sm:hidden" />
          <h2 className="font-serif text-xl font-semibold text-stone-900 mb-1">Guest Sign-in</h2>
          <p className="text-stone-500 text-sm mb-4">Please share your details to continue as a guest.</p>
          <form onSubmit={submitGuest} className="space-y-3">
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-base
                         focus:outline-none focus:ring-2 focus:ring-maroon-700"
            />
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-base
                         focus:outline-none focus:ring-2 focus:ring-maroon-700"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-base
                         focus:outline-none focus:ring-2 focus:ring-maroon-700"
            />
            <button
              type="submit"
              disabled={savingGuest}
              className="w-full bg-maroon-700 text-white rounded-xl py-3.5 text-base font-semibold
                         tap-target disabled:opacity-40 active:scale-95 transition-transform"
            >
              {savingGuest ? 'Saving…' : 'Continue as Guest'}
            </button>
          </form>
          <button
            onClick={onGuest}
            className="block w-full text-center text-xs text-stone-400 mt-3 hover:text-stone-600 tap-target py-1"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Introduction step ─────────────────────────────────────────────────────
  if (cropSrc) {
    return (
      <AvatarCropModal
        imageSrc={cropSrc}
        onSave={handleCropSave}
        onClose={() => setCropSrc(null)}
      />
    );
  }

  if (step === 'intro') {
    const previewMember = {
      display_name: selectedMember?.display_name ?? '',
      avatar_url: localAvatarUrl ?? selectedMember?.avatar_url ?? null,
      gender: selectedMember?.gender ?? null,
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
          <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5 sm:hidden" />
          <p className="text-xs font-semibold text-maroon-700 uppercase tracking-widest mb-0.5">
            Welcome back
          </p>
          <h2 className="font-serif text-xl font-semibold text-stone-900 mb-4">
            TM {selectedMember?.display_name}
          </h2>

          {/* Photo upload */}
          <div className="flex items-center gap-4 mb-4">
            <MemberAvatar member={previewMember} size={56} />
            <div>
              <label className={`cursor-pointer text-sm font-medium tap-target ${
                uploading ? 'text-stone-300 pointer-events-none' : 'text-maroon-600 hover:text-maroon-800'
              }`}>
                {uploading ? 'Uploading…' : localAvatarUrl ? 'Change Photo' : 'Add Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handlePhotoChange}
                  disabled={uploading}
                />
              </label>
              <p className="text-[10px] text-stone-400 mt-0.5">Optional · JPEG or PNG · max 2 MB</p>
            </div>
          </div>

          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="e.g. Software engineer, 2-year TM member, loves public speaking…"
            rows={3}
            maxLength={300}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm
                       focus:outline-none focus:ring-2 focus:ring-maroon-700 resize-none"
          />
          <p className="text-right text-[10px] text-stone-300 -mt-1 mb-3">
            {intro.length}/300
          </p>

          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Your city (e.g. Dehradun)"
            className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm
                       focus:outline-none focus:ring-2 focus:ring-maroon-700 mb-4"
          />

          <div className="flex gap-2">
            <button
              onClick={saveIntro}
              disabled={savingIntro || uploading}
              className="flex-1 bg-maroon-700 text-white rounded-xl py-3 text-sm font-semibold
                         tap-target disabled:opacity-40 active:scale-95 transition-transform"
            >
              {savingIntro ? 'Saving…' : intro.trim() ? 'Save & Continue' : 'Continue'}
            </button>
            <button
              onClick={() => onSelect(selected)}
              className="px-4 py-3 text-sm text-stone-400 hover:text-stone-600 tap-target"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Identity picker ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-6 sm:hidden" />
        <h2 className="font-serif text-xl font-semibold text-stone-900 mb-1">Who are you?</h2>
        <p className="text-stone-500 text-sm mb-4">Pick your name to claim roles. You won&apos;t need to do this again on this device.</p>

        {/* Guest option */}
        <button
          onClick={() => setStep('register')}
          className="w-full text-left px-4 py-3 rounded-xl border border-stone-200 text-stone-500
                     hover:border-stone-300 hover:bg-stone-50 transition-colors mb-3 flex items-center gap-2"
        >
          <span className="text-lg">👤</span>
          <div>
            <p className="text-sm font-medium text-stone-700">Continue as Guest</p>
            <p className="text-xs text-stone-400">View agenda only, no role claiming</p>
          </div>
          <span className="ml-auto text-stone-300 text-sm">→</span>
        </button>

        <div className="relative flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-stone-100" />
          <span className="text-xs text-stone-400 shrink-0">or sign in as a member</span>
          <div className="flex-1 h-px bg-stone-100" />
        </div>

        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-base
                     focus:outline-none focus:ring-2 focus:ring-maroon-700 bg-white tap-target"
        >
          <option value="">Select your name…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name !== m.name.split(' ')[0] ? m.display_name : m.name}
            </option>
          ))}
        </select>

        <button
          disabled={!selected}
          onClick={handleThatSMe}
          className="mt-4 w-full bg-maroon-700 text-white rounded-xl py-3.5 text-base font-semibold
                     tap-target disabled:opacity-40 disabled:cursor-not-allowed
                     active:scale-95 transition-transform"
        >
          That&apos;s me
        </button>
      </div>
    </div>
  );
}
