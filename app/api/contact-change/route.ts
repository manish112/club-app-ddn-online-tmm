import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyContactChangeAffirmation } from '@/lib/email/notifications';
import { getLatestDeviceCapture } from '@/lib/member-consent';

// Kept out of the admin panel deliberately — this is a fixed compliance
// record-keeping address, not a per-club setting. Matches lib/member-consent.ts.
const CONSENT_RECORD_CC = 'singhmanish.work@gmail.com';

const isEmail = (v: string) => /.+@.+\..+/.test(v.trim());

// Sends the compliance receipt whenever a member's email or phone changes —
// called after the client has already persisted the new value and reset that
// channel's consent to 'pending' (see components/MemberDashboard.tsx,
// components/ConsentGateModal.tsx for the member's own edit, and
// app/amiadmin/page.tsx's saveContact() for an admin editing on the member's
// behalf). An email change is sent to BOTH the old and the new address — the
// old inbox is exactly the one that would notice a takeover — while a phone
// change (which has no inbox of its own) goes to whatever email is on file.
export async function POST(req: NextRequest) {
  try {
    const { memberId, channel, oldValue, newValue, actorId, actorIsAdmin } = await req.json() as {
      memberId: string;
      channel: 'email' | 'whatsapp';
      oldValue: string;
      newValue: string;
      /** The member acting alone omits these — an admin editing on their
       *  behalf passes their own id and true. */
      actorId?: string | null;
      actorIsAdmin?: boolean;
    };

    if (!memberId || (channel !== 'email' && channel !== 'whatsapp') || !newValue?.trim()) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: member } = await supabase
      .from('members').select('id, name, display_name, email').eq('id', memberId).single();
    if (!member) return NextResponse.json({ error: 'member not found' }, { status: 404 });

    const isAdminChange = !!actorIsAdmin && !!actorId && actorId !== memberId;
    const [{ data: actor }, device] = await Promise.all([
      isAdminChange
        ? supabase.from('members').select('name, display_name').eq('id', actorId as string).single()
        : Promise.resolve({ data: null }),
      // Whoever's device this was — the admin's, when it's an admin edit; the
      // member's own otherwise.
      getLatestDeviceCapture(isAdminChange ? (actorId as string) : memberId),
    ]);

    const changedAt = new Date().toISOString();

    // An email change is heard by both ends of it; a phone change has no inbox
    // of its own, so it's reported to whatever email the member has on file.
    const recipients = new Set<string>();
    if (channel === 'email') {
      if (member.email) recipients.add(member.email);
      if (isEmail(oldValue) && oldValue.trim().toLowerCase() !== (member.email ?? '').toLowerCase()) {
        recipients.add(oldValue.trim());
      }
    } else if (member.email) {
      recipients.add(member.email);
    }

    for (const recipientEmail of recipients) {
      try {
        await notifyContactChangeAffirmation({
          target: member, recipientEmail, channel, oldValue: oldValue ?? '', newValue,
          changedAt, actor: actor ?? null, actorIsAdmin: isAdminChange,
          device: device as Record<string, string | null> | null, ccEmail: CONSENT_RECORD_CC,
        });
      } catch (err) {
        console.error('[contact-change] affirmation email failed:', err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[contact-change] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
