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

export async function recordConsent(
  memberId: string, channel: ConsentChannel, decision: ConsentDecision,
  /** True when an existing member ticked the "I was aware of this feature
   *  since it started" box alongside granting — included in the confirmation
   *  email, not stored as its own column. */
  retroactive = false,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServiceClient();

  const [{ data: member }, { data: capture }] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, phone').eq('id', memberId).single(),
    // device_captures is service-role-only (no anon RLS policy) — this lookup
    // can only happen here, not from the client that's asking.
    supabase.from('device_captures')
      .select('ip, browser, browser_version, os, device_type, city, country')
      .eq('member_id', memberId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!member) return { error: 'member not found' };

  const device: DeviceSnapshot | null = capture
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
