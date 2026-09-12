import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { createResetCode } from '@/lib/password-reset';

// Clears a member's password AND generates the verification code they'll need
// to set a new one — see lib/password-reset.ts for why the code can't just be
// a members column. The code is returned here so the admin panel can show it
// to the admin, who relays it to the member however makes sense (WhatsApp,
// phone call, in person) — this route sends nothing itself.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.adminId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetMemberId = String(body.targetMemberId ?? '');
  if (!targetMemberId) return NextResponse.json({ error: 'Missing targetMemberId' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('members')
    .update({ password_hash: null, password_salt: null }).eq('id', targetMemberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const code = await createResetCode(targetMemberId);
  return NextResponse.json({ ok: true, code });
}
