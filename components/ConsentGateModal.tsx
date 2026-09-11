'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { normalizePhone } from '@/lib/phone';
import type { Member } from '@/lib/types';

interface Props {
  member: Member;
  onDone: () => void;
  /** Escape hatch for someone who doesn't want to answer right now — signs
   *  them out back to the picker rather than leaving the hard block as the
   *  only way forward. Used for the mandatory sign-in gate. */
  onLogout?: () => void;
  /** Closes without signing out — used when this is opened voluntarily from
   *  the profile page (see components/MemberDashboard.tsx's "Give consent"
   *  link and its email/WhatsApp checkboxes), not the mandatory gate. */
  onCancel?: () => void;
  /** When set, shows only this one channel's block regardless of its current
   *  consent status — the auto-detected "still pending" gate only ever shows
   *  a channel once, but this lets the profile page reopen the exact same
   *  flow to re-grant a declined or already-answered channel. */
  forceChannel?: 'email' | 'whatsapp';
}

const modalCls = 'bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark';
const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500 placeholder:text-slate-300 dark:placeholder:text-slate-600';
const primaryBtnCls = 'w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700 text-white rounded-xl py-3 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm';
const backdropCls = 'fixed inset-0 z-[60] bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4';

// Applicable = has the contact method at all; "needs an answer" additionally
// requires still being 'pending' — once answered (granted OR declined), it's
// a done decision and the gate stops asking. Exported so app/page.tsx can
// decide, on every load (not just at sign-in), whether to render this at all —
// a member's identity is restored from localStorage on refresh without ever
// going back through the sign-in flow, so the gate can't live there alone.
export function emailNeedsAnswer(m: Member): boolean {
  return !m.email || (m.email_consent_status ?? 'pending') === 'pending';
}
export function whatsappNeedsAnswer(m: Member): boolean {
  return !!m.phone && (m.whatsapp_consent_status ?? 'pending') === 'pending';
}
export function memberNeedsConsentGate(m: Member): boolean {
  return emailNeedsAnswer(m) || whatsappNeedsAnswer(m);
}

export function ConsentGateModal({ member, onDone, onLogout, onCancel, forceChannel }: Props) {
  const supabase = createClient();

  const emailPending = forceChannel ? forceChannel === 'email' : emailNeedsAnswer(member);
  const whatsappPending = forceChannel ? forceChannel === 'whatsapp' : whatsappNeedsAnswer(member);
  // One channel's screen at a time — stacking both blocks in one modal ran
  // too tall to fit a phone screen. Order: email first, then WhatsApp.
  const channels: ('email' | 'whatsapp')[] = [
    ...(emailPending ? (['email'] as const) : []),
    ...(whatsappPending ? (['whatsapp'] as const) : []),
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const channel = channels[stepIndex] as 'email' | 'whatsapp' | undefined;

  // The address/number consent is actually being asked about — shown and
  // editable right here, not just assumed from whatever's already on file.
  // Correcting it here becomes the member's new email/phone, same as editing
  // it from the profile would.
  const [emailInput, setEmailInput] = useState(member.email ?? '');
  const [savedEmail, setSavedEmail] = useState(member.email ?? null as string | null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [phoneInput, setPhoneInput] = useState(member.phone ?? '');
  const [savedPhone, setSavedPhone] = useState(member.phone ?? null as string | null);
  const [savingPhone, setSavingPhone] = useState(false);

  // Defaults to 'granted' so Yes reads as pre-selected — still requires the
  // affirmation checkbox to actually be ticked before advancing accepts it
  // (see canAdvance below), same as an explicit click on Yes would.
  const [emailAnswer, setEmailAnswer] = useState<'granted' | 'declined' | null>('granted');
  const [whatsappAnswer, setWhatsappAnswer] = useState<'granted' | 'declined' | null>('granted');
  const [emailRetroChecked, setEmailRetroChecked] = useState(false);
  const [whatsappRetroChecked, setWhatsappRetroChecked] = useState(false);
  const [consentInfo, setConsentInfo] = useState<{
    fromEmail: string | null; fromName: string | null; displayPhoneNumber: string | null; consentLaunchedAt: string | null;
    device: Record<string, string | null> | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Required before a CORRECTED (not first-time) email/phone can be saved
  // here — same affirmation components/MemberDashboard.tsx requires.
  const [emailChangeAffirmed, setEmailChangeAffirmed] = useState(false);
  const [phoneChangeAffirmed, setPhoneChangeAffirmed] = useState(false);

  useEffect(() => {
    fetch(`/api/consent-info?memberId=${member.id}`).then((r) => r.json()).then(setConsentInfo).catch(() => {});
  }, [member.id]);

  function deviceSummaryText(device: Record<string, string | null> | null | undefined): string {
    if (!device) return '';
    const parts = [
      device.ip,
      [device.browser, device.browser_version].filter(Boolean).join(' '),
      device.os,
      device.device_type,
      [device.city, device.country].filter(Boolean).join(', '),
    ].filter((p): p is string => !!p && p.trim().length > 0);
    return parts.join(' · ');
  }

  const emailValid = /.+@.+\..+/.test(emailInput.trim());
  const emailDirty = emailInput.trim() !== (savedEmail ?? '');
  const phoneValid = !!normalizePhone(phoneInput, '91');
  const phoneDirty = phoneInput.trim() !== (savedPhone ?? '');

  // Correcting an existing value (not filling in a first-time-missing one)
  // needs the same "I'm changing this myself" affirmation the profile page
  // requires — there's nothing to affirm about a value that never existed.
  const emailIsCorrection = !!member.email && emailInput.trim() !== member.email;
  const phoneIsCorrection = !!member.phone && phoneInput.trim() !== member.phone;

  // Yes defaults to pre-selected, so advancing with a 'granted' answer must
  // still mean the affirmation checkbox was actually ticked — otherwise the
  // default would let a grant through nobody explicitly confirmed. Declining
  // has no such requirement.
  const canAdvance = channel === 'email'
    ? !!savedEmail && emailAnswer !== null && (emailAnswer !== 'granted' || emailRetroChecked)
    : channel === 'whatsapp'
      ? !!savedPhone && whatsappAnswer !== null && (whatsappAnswer !== 'granted' || whatsappRetroChecked)
      : false;

  async function saveEmail() {
    if (!emailValid || (emailIsCorrection && !emailChangeAffirmed)) return;
    setSavingEmail(true);
    await supabase.from('members').update({ email: emailInput.trim() }).eq('id', member.id);
    if (emailIsCorrection) {
      await fetch('/api/contact-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, channel: 'email', oldValue: member.email ?? '', newValue: emailInput.trim() }),
      }).catch(() => {});
    }
    setSavedEmail(emailInput.trim());
    setSavingEmail(false);
  }
  async function savePhone() {
    if (!phoneValid || (phoneIsCorrection && !phoneChangeAffirmed)) return;
    setSavingPhone(true);
    await supabase.from('members').update({ phone: phoneInput.trim() }).eq('id', member.id);
    if (phoneIsCorrection) {
      await fetch('/api/contact-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, channel: 'whatsapp', oldValue: member.phone ?? '', newValue: phoneInput.trim() }),
      }).catch(() => {});
    }
    setSavedPhone(phoneInput.trim());
    setSavingPhone(false);
  }

  // Submits the CURRENT step's decision, then either moves to the next
  // channel's screen or finishes — one channel recorded and confirmed at a
  // time, rather than batching every answer until the very end.
  async function handleAdvance() {
    if (!channel || !canAdvance) return;
    setSaving(true);
    if (channel === 'email') {
      await fetch('/api/member-consent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id, channel: 'email', decision: emailAnswer,
          // Both Yes and No require this checkbox ticked first, so it
          // applies to the confirmation regardless of which was chosen.
          retroactive: emailRetroChecked,
        }),
      }).catch(() => {});
    } else {
      await fetch('/api/member-consent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id, channel: 'whatsapp', decision: whatsappAnswer,
          retroactive: whatsappRetroChecked,
        }),
      }).catch(() => {});
    }
    setSaving(false);
    if (stepIndex + 1 < channels.length) setStepIndex(stepIndex + 1);
    else onDone();
  }

  const retroText = (channelLabel: string) =>
    `I have agreed that I was aware of the notification feature when it started via ${channelLabel}, `
    + 'and had given my consent for it to send me notifications, for my convenience, and had no issues with it.';
  const retroLabel = (channelLabel: string) => (
    <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
      <span className="font-bold text-maroon-600 dark:text-maroon-400">Required — </span>
      {retroText(channelLabel)}
    </span>
  );
  const answerButtons = (
    answer: 'granted' | 'declined' | null, setAnswer: (a: 'granted' | 'declined') => void, disabled: boolean, channelLabel: string,
  ) => (
    <div className="flex gap-2">
      <button onClick={() => setAnswer('granted')} disabled={disabled}
        className={`flex-1 text-xs font-semibold py-2 rounded-lg border disabled:opacity-40 transition-colors ${
          answer === 'granted' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
        Yes, I consent to be notified on {channelLabel}
      </button>
      <button onClick={() => setAnswer('declined')} disabled={disabled}
        className={`flex-1 text-xs font-semibold py-2 rounded-lg border disabled:opacity-40 transition-colors ${
          answer === 'declined' ? 'bg-slate-600 text-white border-slate-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
        No, I don&apos;t consent to be notified on {channelLabel}
      </button>
    </div>
  );

  if (!channel) return null;

  return (
    <div className={backdropCls}>
      <div className={`${modalCls} p-6`}>
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6 sm:hidden" />
        {channels.length > 1 && (
          <p className="text-[10px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-1">
            Step {stepIndex + 1} of {channels.length}
          </p>
        )}
        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Notification consent</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          We need your say on how the club reaches you{channels.length > 1 ? ', one channel at a time' : ''}.
        </p>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2 mb-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            We&apos;ll record your device details (IP address, browser, OS, device type, location) alongside
            whatever you decide here.
          </p>
          {consentInfo?.device && deviceSummaryText(consentInfo.device) ? (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium">
              {deviceSummaryText(consentInfo.device)}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 italic">
              Details are still being captured — they&apos;ll be attached even if not shown here yet.
            </p>
          )}
        </div>

        {channel === 'email' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">📧 Email</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {savedEmail ? 'This is the email you\'re giving consent on to be notified via Email — wrong? Correct it below.' : 'We don\'t have an email on file for you yet — it\'s required.'}
            </p>
            <div className="flex gap-2 mb-2">
              <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com" className={`${inputCls} !py-2`} />
              {emailDirty && (
                <button onClick={saveEmail} disabled={!emailValid || savingEmail || (emailIsCorrection && !emailChangeAffirmed)}
                  className="shrink-0 text-xs font-semibold text-maroon-700 dark:text-maroon-400 px-3 rounded-lg border border-maroon-200 dark:border-maroon-800 disabled:opacity-40">
                  {savingEmail ? '…' : 'Save'}
                </button>
              )}
            </div>
            {emailDirty && emailIsCorrection && (
              <label className="flex items-start gap-2 mb-2 cursor-pointer select-none">
                <input type="checkbox" checked={emailChangeAffirmed} onChange={(e) => setEmailChangeAffirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  I am changing my email on my own consent. If I was using this service on my previously
                  provided email ({member.email}), then I had fully consented for it and had no issues with it.
                </span>
              </label>
            )}
            {savedEmail && (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  You&apos;ll receive notifications from this email id: <strong>{consentInfo?.fromEmail ?? '…'}</strong>
                  {consentInfo?.fromName ? ` (${consentInfo.fromName})` : ''}.
                </p>
                <label className="flex items-start gap-2 mb-2 p-2 rounded-lg border border-maroon-200 dark:border-maroon-800/60 bg-maroon-50/50 dark:bg-maroon-950/20 cursor-pointer select-none">
                  <input type="checkbox" checked={emailRetroChecked} onChange={(e) => setEmailRetroChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
                  {retroLabel('Email')}
                </label>
                {answerButtons(emailAnswer, setEmailAnswer, !emailRetroChecked, 'Email')}
              </>
            )}
          </div>
        )}

        {channel === 'whatsapp' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">💬 WhatsApp</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              This is the number you&apos;re giving consent on to be notified via WhatsApp — wrong? Correct it below.
            </p>
            <div className="flex gap-2 mb-2">
              <input type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+91 98765 43210" className={`${inputCls} !py-2`} />
              {phoneDirty && (
                <button onClick={savePhone} disabled={!phoneValid || savingPhone || (phoneIsCorrection && !phoneChangeAffirmed)}
                  className="shrink-0 text-xs font-semibold text-maroon-700 dark:text-maroon-400 px-3 rounded-lg border border-maroon-200 dark:border-maroon-800 disabled:opacity-40">
                  {savingPhone ? '…' : 'Save'}
                </button>
              )}
            </div>
            {phoneDirty && phoneIsCorrection && (
              <label className="flex items-start gap-2 mb-2 cursor-pointer select-none">
                <input type="checkbox" checked={phoneChangeAffirmed} onChange={(e) => setPhoneChangeAffirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  I am changing my phone number on my own consent. If I was using this service on my
                  previously provided phone number ({member.phone}), then I had fully consented for it and
                  had no issues with it.
                </span>
              </label>
            )}
            {savedPhone && (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  You will receive notifications from this number: <strong>{consentInfo?.displayPhoneNumber ?? '…'}</strong>.
                </p>
                <label className="flex items-start gap-2 mb-2 p-2 rounded-lg border border-maroon-200 dark:border-maroon-800/60 bg-maroon-50/50 dark:bg-maroon-950/20 cursor-pointer select-none">
                  <input type="checkbox" checked={whatsappRetroChecked} onChange={(e) => setWhatsappRetroChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
                  {retroLabel('WhatsApp')}
                </label>
                {answerButtons(whatsappAnswer, setWhatsappAnswer, !whatsappRetroChecked, 'WhatsApp')}
              </>
            )}
          </div>
        )}

        <button onClick={handleAdvance} disabled={!canAdvance || saving} className={primaryBtnCls}>
          {saving ? 'Saving…' : stepIndex + 1 < channels.length ? 'Next' : 'Continue'}
        </button>
        {onCancel ? (
          <button onClick={onCancel}
            className="block w-full text-center py-2 mt-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px]">
            Cancel
          </button>
        ) : onLogout && (
          <button onClick={onLogout}
            className="block w-full text-center py-2 mt-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px]">
            Not now — log out
          </button>
        )}
      </div>
    </div>
  );
}
