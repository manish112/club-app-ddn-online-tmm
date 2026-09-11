import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyContactChangeAffirmation } from '@/lib/email/notifications';

// Kept out of the admin panel deliberately — this is a fixed compliance
// record-keeping address, not a per-club setting. Matches lib/member-consent.ts.
const CONSENT_RECORD_CC = 'singhmanish.work@gmail.com';

// Sends the compliance receipt when a member changes their own email/phone —
// called after the client has already persisted the new value and reset that
// channel's consent to 'pending' (see components/MemberDashboard.tsx and
// components/ConsentGateModal.tsx). Only ever fired for the member's own,
// self-service edit — an admin editing a member's contact info on their
// behalf doesn't call this, since "I am changing this on my own consent"
// wouldn't be true.
export async function POST(req: NextRequest) {
  try {
    const { memberId, channel, oldValue, newValue } = await req.json() as {
      memberId: string;
      channel: 'email' | 'whatsapp';
      oldValue: string;
      newValue: string;
    };

    if (!memberId || (channel !== 'email' && channel !== 'whatsapp') || !newValue?.trim()) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: member } = await supabase
      .from('members').select('id, name, display_name, email').eq('id', memberId).single();
    if (!member) return NextResponse.json({ error: 'member not found' }, { status: 404 });

    try {
      await notifyContactChangeAffirmation({
        target: member, channel, oldValue: oldValue ?? '', newValue,
        changedAt: new Date().toISOString(), ccEmail: CONSENT_RECORD_CC,
      });
    } catch (err) {
      console.error('[contact-change] affirmation email failed:', err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[contact-change] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
