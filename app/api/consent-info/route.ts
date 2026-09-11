import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';

// Non-secret display info the sign-in consent gate needs to show a member —
// email_settings and whatsapp_settings are service-role-only (no anon RLS
// policy), so components/MemberPicker.tsx (a client component) can't read
// from_email/display_phone_number directly; this exposes just those two
// fields, plus the one-time consent cutover timestamp (also readable
// straight off agenda_config, but bundled here so the gate makes one call).
//
// Optionally takes ?memberId= and also returns that member's most recent
// device_captures row (also service-role-only) — the consent gate shows this
// back to the member as a preview of exactly what lib/member-consent.ts's
// recordConsent() will snapshot alongside their decision, so there are no
// surprises between what's shown and what's actually recorded.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  const supabase = createServiceClient();
  const [{ data: email }, { data: whatsapp }, { data: agenda }, capture] = await Promise.all([
    supabase.from('email_settings').select('from_email, from_name').eq('id', 1).single(),
    supabase.from('whatsapp_settings').select('display_phone_number').eq('id', 1).single(),
    supabase.from('agenda_config').select('consent_launched_at').eq('id', 1).single(),
    memberId
      ? supabase.from('device_captures')
          .select('ip, browser, browser_version, os, device_type, city, country')
          .eq('member_id', memberId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    fromEmail: email?.from_email ?? null,
    fromName: email?.from_name ?? null,
    displayPhoneNumber: whatsapp?.display_phone_number ?? null,
    consentLaunchedAt: agenda?.consent_launched_at ?? null,
    device: capture.data ?? null,
  });
}
