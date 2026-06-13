'use client';
import { useEffect } from 'react';
import type { CaptureClientSignals } from './types';

// FingerprintJS is code-split (dynamic import) so it stays out of the main page
// bundle, and the loaded agent is memoised — one per tab.
let visitorIdPromise: Promise<string | null> | null = null;
function getVisitorId(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  visitorIdPromise ??= import('@fingerprintjs/fingerprintjs')
    .then((m) => m.default.load())
    .then((fp) => fp.get())
    .then((r) => r.visitorId)
    .catch(() => null);
  return visitorIdPromise;
}

function clientSignals(): Omit<CaptureClientSignals, 'visitorId' | 'memberId'> {
  if (typeof window === 'undefined') return {};
  const dpr = window.devicePixelRatio || 1;
  return {
    screen: `${window.screen.width}x${window.screen.height}@${dpr}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    languages: navigator.languages?.join(',') ?? navigator.language ?? null,
    path: window.location.pathname,
  };
}

// Fire a single capture. Resolves quietly on any failure — tracking must never
// surface errors to the user or block the UI.
async function capture(memberId: string | null): Promise<void> {
  try {
    const visitorId = await getVisitorId();
    const payload: CaptureClientSignals = { visitorId, memberId, ...clientSignals() };
    await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* swallow — analytics is best-effort */
  }
}

// Capture once per "identity" per tab session. A signed-out visit and a later
// signed-in visit each record once, so we can attribute usage to a member
// without re-logging on every render or navigation.
export function useCapture(memberId: string | null, ready: boolean): void {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const key = `tm_captured_${memberId ?? 'anon'}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    capture(memberId);
  }, [memberId, ready]);
}
