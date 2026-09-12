// Records a member's answer to the mandatory notification-consent question —
// called both from the sign-in gate (components/MemberPicker.tsx, via
// app/api/member-consent/route.ts) and from the ongoing profile toggle
// (components/MemberDashboard.tsx's ProfileCard, same route) — one consent
// record per channel per decision, not a combined one.
import { createServiceClient } from '@/utils/supabase/server';
import { notifyConsentDecision, notifyWelcomeEmail } from '@/lib/email/notifications';
import { waSendWelcome } from '@/lib/whatsapp/notifications';

// Kept out of the admin panel deliberately — this is a fixed compliance
// record-keeping address, not a per-club setting.
const CONSENT_RECORD_CC = 'singhmanish.work@gmail.com';

export type ConsentChannel = 'email' | 'whatsapp';
export type ConsentDecision = 'granted' | 'declined';

export interface DeviceSnapshot {
  ip: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  device_type: string | null;
  city: string | null;
  country: string | null;
}

// device_captures is service-role-only (no anon RLS policy) — this lookup can
// only happen server-side, keyed by whichever member's browser session it was
// (the actor performing an action, not necessarily the record it's about).
export async function getLatestDeviceCapture(memberId: string): Promise<DeviceSnapshot | null> {
  const supabase = createServiceClient();
  const { data: capture } = await supabase.from('device_captures')
    .select('ip, browser, browser_version, os, device_type, city, country')
    .eq('member_id', memberId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return capture
    ? {
        ip: capture.ip ?? null,
        browser: capture.browser ?? null,
        browser_version: capture.browser_version ?? null,
        os: capture.os ?? null,
        device_type: capture.device_type ?? null,
        city: capture.city ?? null,
        country: capture.country ?? null,
      }
    : null;
}

export async function recordConsent(
  memberId: string, channel: ConsentChannel, decision: ConsentDecision,
  /** True when an existing member ticked the "I was aware of this feature
   *  since it started" box alongside granting — included in the confirmation
   *  email, not stored as its own column. */
  retroactive = false,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServiceClient();

  const [{ data: member }, device] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, phone').eq('id', memberId).single(),
    getLatestDeviceCapture(memberId),
  ]);
  if (!member) return { error: 'member not found' };

  const decidedAt = new Date().toISOString();
  const notificationsField = channel === 'email' ? 'email_notifications' : 'whatsapp_notifications';

  const { error } = await supabase.from('members').update({
    [notificationsField]: decision === 'granted',
    [`${channel}_consent_status`]: decision,
    [`${channel}_consent_at`]: decidedAt,
    [`${channel}_consent_device`]: device,
  }).eq('id', memberId);
  if (error) return { error: error.message };

  // Best-effort, both of these — neither should undo a decision that's
  // already recorded.
  //
  // Granting is the moment sending actually becomes allowed for this channel
  // (lib/email/mailer.ts's deliver() and lib/whatsapp/notifications.ts's
  // waMemberSkipReason both now require consent === 'granted'), so this is
  // the first message that channel is able to deliver — the welcome, same
  // as a newly-added member gets.
  if (decision === 'granted') {
    try {
      if (channel === 'email') await notifyWelcomeEmail(member);
      else await waSendWelcome(memberId);
    } catch (err) {
      console.error('[member-consent] welcome send failed:', err);
    }
  }

  // Sent whenever there's an email on file at all, regardless of which
  // channel this decision was about or what was decided — a compliance
  // receipt, not a notification, so it's exempt from the gate above.
  if (member.email) {
    try {
      await notifyConsentDecision({
        target: member, channel, decision, decidedAt, retroactive,
        contactValue: channel === 'email' ? member.email : member.phone,
        device: device as Record<string, string | null> | null, ccEmail: CONSENT_RECORD_CC,
      });
    } catch (err) {
      console.error('[member-consent] confirmation email failed:', err);
    }
  }

  return { ok: true };
}

// Manual re-send of the consent receipt already on file — for whenever the
// original (sent from recordConsent above) didn't land: a bounce, a spam
// filter, a full inbox. Doesn't touch the recorded decision at all, just
// replays the same receipt an admin would otherwise have to reconstruct by
// hand. Only ever an option once a real decision exists for that channel —
// there's nothing to resend while it's still 'pending'.
export async function resendConsentReceipt(
  memberId: string, channel: ConsentChannel,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServiceClient();
  const { data: member } = await supabase.from('members')
    .select(`
      id, name, display_name, email, phone,
      email_consent_status, email_consent_at, email_consent_device,
      whatsapp_consent_status, whatsapp_consent_at, whatsapp_consent_device
    `)
    .eq('id', memberId).single();
  if (!member) return { error: 'member not found' };
  if (!member.email) return { error: 'member has no email on file to send the receipt to' };

  const status: ConsentDecision | 'pending' = channel === 'email'
    ? member.email_consent_status : member.whatsapp_consent_status;
  const decidedAt: string | null = channel === 'email'
    ? member.email_consent_at : member.whatsapp_consent_at;
  const device = channel === 'email' ? member.email_consent_device : member.whatsapp_consent_device;
  if (status !== 'granted' && status !== 'declined') {
    return { error: `no ${channel} consent decision recorded for this member yet` };
  }
  if (!decidedAt) return { error: `no ${channel} consent decision recorded for this member yet` };

  try {
    await notifyConsentDecision({
      target: member, channel, decision: status, decidedAt,
      // Resending doesn't know whether the original grant carried the
      // retro-awareness affirmation, so it's left off rather than guessed.
      retroactive: false,
      contactValue: channel === 'email' ? member.email : member.phone,
      device: device as Record<string, string | null> | null, ccEmail: CONSENT_RECORD_CC,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'send failed' };
  }
  return { ok: true };
}
