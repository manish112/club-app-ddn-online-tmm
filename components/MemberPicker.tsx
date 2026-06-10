'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member, Meeting } from '@/lib/types';
import { MemberAvatar } from '@/components/MemberAvatar';
import { AvatarCropModal } from '@/components/AvatarCropModal';
import { hashPassword, generateSalt, verifyPassword } from '@/lib/crypto';

interface Props {
  members: Member[];
  meetingId: string | null;
  upcomingMeetings: Meeting[];
  onSelect: (id: string) => void;
  onGuest: () => void;
}

type Step = 'identify' | 'register' | 'choose' | 'pick_meeting' | 'done' | 'verify_password' | 'set_password' | 'intro';

const modalCls = 'bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark';
const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500 placeholder:text-slate-300 dark:placeholder:text-slate-600';
const primaryBtnCls = 'w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700 text-white rounded-xl py-3 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm';
const backdropCls = 'fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4';

export function MemberPicker({ members, meetingId, upcomingMeetings, onSelect, onGuest }: Props) {
  const supabase = createClient();
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState<Step>('identify');

  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [savingGuest, setSavingGuest] = useState(false);

  const [passwordInput, setPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [intro, setIntro] = useState('');
  const [city, setCity] = useState('');
  const [savingIntro, setSavingIntro] = useState(false);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectedMember = members.find((m) => m.id === selected);

  async function submitGuestDetails(e: React.FormEvent) {
    e.preventDefault();
    setStep('choose');
  }

  async function saveGuestInquiry() {
    setSavingGuest(true);
    await supabase.from('guest_registrations').insert({
      meeting_id: null,
      name: guestName.trim() || null,
      phone: phone.trim(),
      email: email.trim(),
      registration_type: 'inquiry',
    });
    setSavingGuest(false);
    setStep('done');
  }

  async function saveGuestAttendance(chosenMeetingId: string) {
    setSavingGuest(true);
    await supabase.from('guest_registrations').insert({
      meeting_id: chosenMeetingId || null,
      name: guestName.trim() || null,
      phone: phone.trim(),
      email: email.trim(),
      registration_type: 'attendance',
    });
    setSavingGuest(false);
    setStep('done');
  }

  async function handleThatSMe() {
    if (!selected) return;
    setPasswordLoading(true);
    const { data } = await supabase.from('members').select('password_hash').eq('id', selected).single();
    setPasswordLoading(false);
    setPasswordError('');
    setPasswordInput('');
    setNewPassword('');
    setConfirmPassword('');
    if (data?.password_hash) {
      setStep('verify_password');
    } else {
      setStep('set_password');
    }
  }

  function proceedAfterAuth() {
    const member = members.find((m) => m.id === selected);
    if (member?.introduction && member?.city) {
      onSelect(selected);
    } else {
      setIntro(member?.introduction ?? '');
      setCity(member?.city ?? '');
      setStep('intro');
    }
  }

  async function handleVerifyPassword() {
    if (!passwordInput) return;
    setPasswordLoading(true);
    setPasswordError('');
    const { data } = await supabase.from('members').select('password_hash, password_salt').eq('id', selected).single();
    if (!data?.password_hash || !data?.password_salt) { setPasswordLoading(false); proceedAfterAuth(); return; }
    const valid = await verifyPassword(passwordInput, data.password_salt, data.password_hash);
    setPasswordLoading(false);
    if (!valid) { setPasswordError('Incorrect password. Please try again.'); return; }
    proceedAfterAuth();
  }

  async function handleSetPassword() {
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordLoading(true);
    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    await supabase.from('members').update({ password_hash: hash, password_salt: salt }).eq('id', selected);
    setPasswordLoading(false);
    proceedAfterAuth();
  }

  async function saveIntro() {
    setSavingIntro(true);
    await supabase.from('members').update({ introduction: intro.trim() || null, city: city.trim() || null }).eq('id', selected);
    setSavingIntro(false);
    onSelect(selected);
  }

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
    const { error } = await supabase.storage.from('member-avatars').upload(selected, blob, { upsert: true, contentType: 'image/jpeg' });
    if (!error) {
      const { data } = supabase.storage.from('member-avatars').getPublicUrl(selected);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('members').update({ avatar_url: url }).eq('id', selected);
      setLocalAvatarUrl(url);
    }
    setUploading(false);
  }

  const DragHandle = () => (
    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6 sm:hidden" />
  );

  // ── Guest registration: details ───────────────────────────────────────────
  if (step === 'register') {
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6`}>
          <DragHandle />
          <p className="text-[10px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-1">Step 1 of 2</p>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Your Details</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">We&apos;ll use these to follow up with you.</p>
          <form onSubmit={submitGuestDetails} className="space-y-3">
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name (optional)" className={inputCls} />
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={inputCls} />
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className={inputCls} />
            <button type="submit" className={primaryBtnCls}>Next →</button>
          </form>
          <button onClick={onGuest} className="block w-full text-center text-xs text-slate-400 dark:text-slate-500 mt-3 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px]">
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Guest registration: choose intent ─────────────────────────────────────
  if (step === 'choose') {
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6`}>
          <DragHandle />
          <button onClick={() => setStep('register')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px] mb-3">← Back</button>
          <p className="text-[10px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-1">Step 2 of 2</p>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">How can we help?</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">Choose what you&apos;d like to do.</p>

          <div className="space-y-3">
            {/* Option 1: Attend a meeting */}
            <button
              onClick={() => setStep('pick_meeting')}
              className="w-full text-left p-4 rounded-2xl border-2 border-maroon-200 dark:border-maroon-800/60
                         bg-maroon-50 dark:bg-maroon-950/20 hover:border-maroon-400 dark:hover:border-maroon-600
                         hover:bg-maroon-100 dark:hover:bg-maroon-950/40 transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🎤</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Attend a free meeting</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Choose an upcoming meeting you&apos;d like to visit. Your first visit is always free!
                  </p>
                </div>
                <span className="shrink-0 text-maroon-400 dark:text-maroon-500 text-lg group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </button>

            {/* Option 2: Inquire */}
            <button
              onClick={saveGuestInquiry}
              disabled={savingGuest}
              className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600
                         hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group disabled:opacity-50"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">💬</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {savingGuest ? 'Saving…' : 'Enquire about this club'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Want to know more before committing? We&apos;ll reach out to answer your questions.
                  </p>
                </div>
                <span className="shrink-0 text-slate-300 dark:text-slate-600 text-lg group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Guest registration: pick meeting ─────────────────────────────────────
  if (step === 'pick_meeting') {
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6`}>
          <DragHandle />
          <button onClick={() => setStep('choose')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px] mb-3">← Back</button>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Choose a Meeting</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Pick the meeting you&apos;d like to attend. It&apos;s free!</p>

          {upcomingMeetings.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400 dark:text-slate-500">No upcoming meetings scheduled yet.</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Check back soon.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingMeetings.map((m) => {
                const dateStr = new Date(m.date + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
                });
                return (
                  <button
                    key={m.id}
                    onClick={() => saveGuestAttendance(m.id)}
                    disabled={savingGuest}
                    className="w-full text-left px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700
                               bg-white dark:bg-slate-800/50 hover:border-maroon-300 dark:hover:border-maroon-700
                               hover:bg-maroon-50 dark:hover:bg-maroon-950/20 transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-maroon-100 dark:bg-maroon-900/40 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-maroon-700 dark:text-maroon-400 leading-none">{new Date(m.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span>
                        <span className="text-base font-black text-maroon-700 dark:text-maroon-300 leading-none">{new Date(m.date + 'T00:00:00').getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Meeting #{m.number}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{dateStr}</p>
                        {m.theme && m.theme !== 'TBD' && (
                          <p className="text-xs text-maroon-600 dark:text-maroon-400 mt-0.5 truncate">&ldquo;{m.theme}&rdquo;</p>
                        )}
                      </div>
                      <span className="ml-auto shrink-0 text-slate-300 dark:text-slate-600 text-lg group-hover:text-maroon-400 group-hover:translate-x-0.5 transition-all">→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Guest registration: done ──────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6 text-center`}>
          <DragHandle />
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-2">You&apos;re all set!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            Thanks for your interest in Dehradun Online Toastmasters. We&apos;ll be in touch soon!
          </p>
          <button onClick={onGuest} className={primaryBtnCls}>Continue to App</button>
        </div>
      </div>
    );
  }

  // ── Verify password ───────────────────────────────────────────────────────
  if (step === 'verify_password') {
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6`}>
          <DragHandle />
          <button onClick={() => setStep('identify')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px] mb-3">
            ← Back
          </button>
          <p className="text-xs font-semibold text-maroon-600 dark:text-maroon-400 uppercase tracking-widest mb-0.5">Welcome back</p>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-4">TM {selectedMember?.display_name}</h2>
          <input type="password" value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPassword(); }}
            placeholder="Enter your password" autoFocus className={`${inputCls} mb-2`} />
          {passwordError && <p className="text-xs text-red-500 mb-3">{passwordError}</p>}
          <button onClick={handleVerifyPassword} disabled={passwordLoading || !passwordInput} className={`${primaryBtnCls} mb-4`}>
            {passwordLoading ? 'Verifying…' : 'Continue'}
          </button>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              🔒 <strong>Forgot your password?</strong> Contact{' '}
              {(() => {
                const president = members.find(m => m.leadership_role === 'president');
                const vpEd = members.find(m => m.leadership_role === 'vp_education');
                const names = [president, vpEd].filter(Boolean).map(m => <strong key={m!.id}>TM {m!.display_name}</strong>);
                if (names.length === 0) return <strong>your club officer</strong>;
                if (names.length === 1) return names[0];
                return <>{names[0]} or {names[1]}</>;
              })()}{' '}
              to reset it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Set password (first time) ─────────────────────────────────────────────
  if (step === 'set_password') {
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6`}>
          <DragHandle />
          <button onClick={() => setStep('identify')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px] mb-3">
            ← Back
          </button>
          <p className="text-xs font-semibold text-maroon-600 dark:text-maroon-400 uppercase tracking-widest mb-0.5">Secure your account</p>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Set a password</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            You&apos;ll need this every time you sign in as TM {selectedMember?.display_name}.
          </p>
          <div className="space-y-2 mb-2">
            <input type="password" value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
              placeholder="New password (min 6 characters)" autoFocus className={inputCls} />
            <input type="password" value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
              placeholder="Confirm password" className={inputCls} />
          </div>
          {passwordError && <p className="text-xs text-red-500 mb-3">{passwordError}</p>}
          <button onClick={handleSetPassword} disabled={passwordLoading || !newPassword || !confirmPassword}
            className={`${primaryBtnCls} mb-3`}>
            {passwordLoading ? 'Saving…' : 'Set Password'}
          </button>
          <button onClick={proceedAfterAuth} className="block w-full text-center py-2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px]">
            Skip for now
          </button>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 mt-3">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              ⚠️ <strong>Not setting a password leaves your profile unprotected.</strong>{' '}
              Anyone who knows your name could sign in as you.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Introduction step ─────────────────────────────────────────────────────
  if (cropSrc) {
    return <AvatarCropModal imageSrc={cropSrc} onSave={handleCropSave} onClose={() => setCropSrc(null)} />;
  }

  if (step === 'intro') {
    const previewMember = {
      display_name: selectedMember?.display_name ?? '',
      avatar_url: localAvatarUrl ?? selectedMember?.avatar_url ?? null,
      gender: selectedMember?.gender ?? null,
    };
    return (
      <div className={backdropCls}>
        <div className={`${modalCls} p-6`}>
          <DragHandle />
          <p className="text-xs font-semibold text-maroon-600 dark:text-maroon-400 uppercase tracking-widest mb-0.5">Welcome back</p>
          <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-0.5">TM {selectedMember?.display_name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Introduce yourself to us</p>
          <div className="flex items-center gap-4 mb-4">
            <MemberAvatar member={previewMember} size={56} />
            <div>
              <label className={`cursor-pointer text-sm font-medium min-h-[36px] flex items-center ${uploading ? 'text-slate-300 pointer-events-none' : 'text-maroon-600 dark:text-maroon-400 hover:text-maroon-800 dark:hover:text-maroon-300'}`}>
                {uploading ? 'Uploading…' : localAvatarUrl ? 'Change Photo' : 'Add Photo'}
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
              </label>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Optional · JPEG or PNG · max 2 MB</p>
            </div>
          </div>
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)}
            placeholder="e.g. Software engineer, 2-year TM member, loves public speaking…"
            rows={3} maxLength={300}
            className={`${inputCls} resize-none`} />
          <p className="text-right text-[10px] text-slate-300 dark:text-slate-600 -mt-1 mb-3">{intro.length}/300</p>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="Your city (e.g. Dehradun)" className={`${inputCls} mb-4`} />
          <div className="flex gap-2">
            <button onClick={saveIntro} disabled={savingIntro || uploading} className={primaryBtnCls}>
              {savingIntro ? 'Saving…' : intro.trim() ? 'Save & Continue' : 'Continue'}
            </button>
            <button onClick={() => onSelect(selected)}
              className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[44px]">
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Identity picker ───────────────────────────────────────────────────────
  return (
    <div className={backdropCls}>
      <div className={`${modalCls} p-6`}>
        <DragHandle />
        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Who are you?</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Pick your name to claim roles. You won&apos;t need to do this again on this device.
        </p>

        <button
          onClick={() => setStep('register')}
          className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700
                     text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600
                     hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mb-3 flex items-center gap-2"
        >
          <span className="text-lg">👤</span>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Continue as Guest</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">View agenda only, no role claiming</p>
          </div>
          <span className="ml-auto text-slate-300 dark:text-slate-600 text-sm">→</span>
        </button>

        <div className="relative flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">or sign in as a member</span>
          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
        </div>

        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className={`${inputCls} text-base`}
        >
          <option value="">Select your name…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name !== m.name.split(' ')[0] ? m.display_name : m.name}
            </option>
          ))}
        </select>

        <button
          disabled={!selected || passwordLoading}
          onClick={handleThatSMe}
          className={`mt-4 ${primaryBtnCls} py-3.5 text-base`}
        >
          {passwordLoading ? 'Checking…' : "That's me"}
        </button>
      </div>
    </div>
  );
}
