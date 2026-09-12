import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { hasPendingResetCode, verifyAndConsumeResetCode } from '@/lib/password-reset';

// Sets a NEW password for a member who currently has none — reached from the
// sign-in gate (components/MemberPicker.tsx) and from the profile page's
// PasswordCard when it's in 'set' mode (never from 'change', which already
// proves identity by requiring the current password). Routed through the
// server, rather than the anon client writing password_hash directly, so the
// verification-code check below can actually enforce something: the code
// itself lives in a service-role-only table the anon key can't read (see
// lib/password-reset.ts), so this is the only place it can be checked.
export async function POST(req: NextRequest) {
  try {
    const { memberId, passwordHash, passwordSalt, code } = await req.json() as {
      memberId?: string; passwordHash?: string; passwordSalt?: string; code?: string;
    };
    if (!memberId || !passwordHash || !passwordSalt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (await hasPendingResetCode(memberId)) {
      if (!code) return NextResponse.json({ error: 'code_required' }, { status: 400 });
      if (!(await verifyAndConsumeResetCode(memberId, code))) {
        return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
      }
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from('members')
      .update({ password_hash: passwordHash, password_salt: passwordSalt }).eq('id', memberId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[set-password] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
