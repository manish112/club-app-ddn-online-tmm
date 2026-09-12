// One-time codes proving whoever sets a new password after a reset is
// actually that member — not just someone who knows their name (see
// supabase/schema.sql's password_reset_codes table for why this can't live
// as a plain members column: the members table has no RLS at all, so
// anything stored there is readable by anyone holding the anon key).
//
// Two entry points clear a password and land here at the same moment:
//   - the admin panel's Reset Password button (app/api/admin/reset-password)
//   - the WhatsApp menu bot's "Reset my password" option
//     (lib/whatsapp/notifications.ts's buildPasswordResetReply)
// Each delivers the code through whatever channel it already has open —
// shown in the admin panel, or included in the same WhatsApp reply — rather
// than this module sending anything itself.
import { createServiceClient } from '@/utils/supabase/server';

const CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — long enough to relay by phone/WhatsApp, short enough to not linger

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createResetCode(memberId: string): Promise<string> {
  const code = generateCode();
  const supabase = createServiceClient();
  await supabase.from('password_reset_codes').upsert({
    member_id: memberId,
    code,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return code;
}

// Whether the sign-in / profile "set a password" screen needs to ask for a
// code at all — a brand-new member who's simply never set one yet has no row
// here, and isn't asked for anything.
export async function hasPendingResetCode(memberId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('password_reset_codes').select('expires_at').eq('member_id', memberId).maybeSingle();
  return !!data && new Date(data.expires_at).getTime() > Date.now();
}

// Single-use: a correct match deletes the row so it can't be replayed.
export async function verifyAndConsumeResetCode(memberId: string, code: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('password_reset_codes').select('code, expires_at').eq('member_id', memberId).maybeSingle();
  if (!data || data.code !== code.trim() || new Date(data.expires_at).getTime() <= Date.now()) return false;
  await supabase.from('password_reset_codes').delete().eq('member_id', memberId);
  return true;
}
