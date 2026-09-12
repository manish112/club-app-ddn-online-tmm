import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { verifyAndConsumeResetCode } from '@/lib/password-reset';
import { getLatestDeviceCapture, CONSENT_RECORD_CC } from '@/lib/member-consent';
import { notifyPasswordChanged } from '@/lib/email/notifications';

// Sets a NEW password for a member who currently has none — reached from the
// sign-in gate (components/MemberPicker.tsx) and from the profile page's
// PasswordCard when it's in 'set' mode (never from 'change', which already
// proves identity by requiring the current password). Routed through the
// server, rather than the anon client writing password_hash directly, so the
// verification-code check below can actually enforce something: the code
// itself lives in a service-role-only table the anon key can't read (see
// lib/password-reset.ts), so this is the only place it can be checked.
//
// A code is ALWAYS required — deliberately not automated. The club is small
// enough that a member without one is expected to ask a club officer (who
// can generate one from the admin panel) or text "Hi" to the club WhatsApp
// number (which only works once they've consented to WhatsApp). That human
// step is the actual security control, not the code's entropy.
export async function POST(req: NextRequest) {
  try {
    const { memberId, passwordHash, passwordSalt, code } = await req.json() as {
      memberId?: string; passwordHash?: string; passwordSalt?: string; code?: string;
    };
    if (!memberId || !passwordHash || !passwordSalt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!code) return NextResponse.json({ error: 'code_required' }, { status: 400 });
    if (!(await verifyAndConsumeResetCode(memberId, code))) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: member, error } = await supabase.from('members')
      .update({ password_hash: passwordHash, password_salt: passwordSalt }).eq('id', memberId)
      .select('id, name, display_name, email').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort — a failed receipt shouldn't undo a password that's already
    // set. Whoever it wasn't for is exactly who needs to see this land.
    if (member?.email) {
      try {
        const device = await getLatestDeviceCapture(memberId);
        await notifyPasswordChanged({
          target: member, changedAt: new Date().toISOString(),
          device: device as Record<string, string | null> | null, ccEmail: CONSENT_RECORD_CC,
        });
      } catch (err) {
        console.error('[set-password] confirmation email failed:', err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[set-password] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
