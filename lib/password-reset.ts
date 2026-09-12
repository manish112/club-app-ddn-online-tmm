// One-time codes proving whoever sets a new (or first-time) password is
// actually that member — not just someone who knows their name (see
// supabase/schema.sql's password_reset_codes table for why this can't live
// as a plain members column: the members table has no RLS at all, so
// anything stored there is readable by anyone holding the anon key).
//
// Deliberately NOT automated: a member can't request one from the sign-in
// screen itself, even a brand-new one setting a password for the first time.
// They have to go through a human — a club officer generating one from the
// admin panel (app/api/admin/reset-password), or the WhatsApp menu bot's
// "Reset my password" option (lib/whatsapp/notifications.ts's
// buildPasswordResetReply, which only replies at all once the number has
// consented to WhatsApp). In a small club where everyone knows everyone,
// that human step IS the security control — not the code's entropy.
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

// Single-use: a correct match deletes the row so it can't be replayed.
export async function verifyAndConsumeResetCode(memberId: string, code: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('password_reset_codes').select('code, expires_at').eq('member_id', memberId).maybeSingle();
  if (!data || data.code !== code.trim() || new Date(data.expires_at).getTime() <= Date.now()) return false;
  await supabase.from('password_reset_codes').delete().eq('member_id', memberId);
  return true;
}
