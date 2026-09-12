'use client';
import { useState, useEffect } from 'react';
import type { Member } from '@/lib/types';
import { TERMS_VERSION, TERMS_URL, PRIVACY_URL } from '@/lib/terms';

interface Props {
  member: Member;
  onDone: () => void;
  /** Escape hatch, same as ConsentGateModal's — signs out back to the picker
   *  rather than leaving the hard block as the only way forward. */
  onLogout: () => void;
}

// Checked on every load, not just at sign-in — same reasoning as
// ConsentGateModal's memberNeedsConsentGate: identity is restored straight
// from localStorage on a refresh, which never goes back through the sign-in
// flow. A version mismatch (including never having accepted at all, where the
// column is null) means the gate shows again.
export function memberNeedsTermsGate(m: Member): boolean {
  return m.terms_accepted_version !== TERMS_VERSION;
}

const modalCls = 'bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark';
const primaryBtnCls = 'w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700 text-white rounded-xl py-3 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm';
const backdropCls = 'fixed inset-0 z-[60] bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4';
const linkCls = 'text-maroon-600 dark:text-maroon-400 font-semibold underline underline-offset-2';

// Same shape ConsentGateModal shows — reused via the same endpoint so the
// device shown here is exactly what recordTermsAcceptance() will snapshot.
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

export function TermsGateModal({ member, onDone, onLogout }: Props) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    fetch(`/api/consent-info?memberId=${member.id}`)
      .then((r) => r.json()).then((d) => setDevice(d.device ?? null)).catch(() => {});
  }, [member.id]);

  async function agree() {
    if (!checked || saving) return;
    setSaving(true);
    await fetch('/api/terms-consent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id }),
    }).catch(() => {});
    setSaving(false);
    onDone();
  }

  return (
    <div className={backdropCls}>
      <div className={`${modalCls} p-6`}>
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6 sm:hidden" />
        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">Terms &amp; Privacy</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          We have revised our Terms &amp; Conditions and Privacy Policy, and need you to accept it to continue
          using this app.
        </p>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          By using this app, TM {member.display_name} agrees to all the{' '}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>Terms and Conditions</a>
          {' '}and has understood the{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>Privacy Policy</a>.
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2 mb-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            We&apos;ll record your device details (IP address, browser, OS, device type, location) alongside
            this acceptance.
          </p>
          {device && deviceSummaryText(device) ? (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium">
              {deviceSummaryText(device)}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 italic">
              Details are still being captured — they&apos;ll be attached even if not shown here yet.
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 mb-4 p-2 rounded-lg border border-maroon-200 dark:border-maroon-800/60 bg-maroon-50/50 dark:bg-maroon-950/20 cursor-pointer select-none">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
          <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <span className="font-bold text-maroon-600 dark:text-maroon-400">Required — </span>
            I have read the Terms &amp; Conditions and Privacy Policy above, and I agree to them. I have also
            been aware of the previous Privacy Policy and Terms &amp; Conditions and have agreed to them in the
            past as well. I understand a confirmation email will be sent recording this, along with my device
            details (IP address, browser, OS, device type, location).
          </span>
        </label>

        <button onClick={agree} disabled={!checked || saving} className={primaryBtnCls}>
          {saving ? 'Saving…' : 'I Agree & Continue'}
        </button>
        <button onClick={onLogout}
          className="block w-full text-center py-2 mt-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[36px]">
          Not now — log out
        </button>
      </div>
    </div>
  );
}
