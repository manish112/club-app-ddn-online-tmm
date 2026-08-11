import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';

// GET: settings with the access token masked (never send it to the client).
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('whatsapp_settings').select('*').eq('id', 1).single();
  if (error || !data) {
    // Almost always means the migrations haven't been applied to this database —
    // say so rather than showing an empty form that silently fails to save.
    return NextResponse.json({ error: 'WhatsApp settings not found — run migrations 055 and 056.' }, { status: 404 });
  }

  const { access_token, ...rest } = data;
  return NextResponse.json({ ...rest, hasToken: !!access_token });
}

// POST: update settings. A blank access_token leaves the stored one unchanged.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = body.settings ?? {};
  // Meta's Graph versions look like "v25.0"; accept a bare "25.0" too rather
  // than reject a save over a missing prefix.
  const rawVersion = String(s.api_version ?? '').trim().replace(/^\/+|\/+$/g, '');
  const apiVersion = rawVersion ? (rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`) : 'v25.0';

  const leadMinutes = Number(s.meeting_starting_lead_minutes);

  const update: Record<string, unknown> = {
    id: 1,
    enabled: !!s.enabled,
    phone_number_id: String(s.phone_number_id ?? '').trim(),
    business_account_id: String(s.business_account_id ?? '').trim(),
    api_version: apiVersion,
    default_country_code: String(s.default_country_code ?? '').replace(/\D+/g, '') || '91',
    text_mode: !!s.text_mode,
    welcome_enabled: !!s.welcome_enabled,
    meeting_created_enabled: !!s.meeting_created_enabled,
    role_change_enabled: !!s.role_change_enabled,
    role_reminder_enabled: !!s.role_reminder_enabled,
    no_role_nudge_enabled: !!s.no_role_nudge_enabled,
    meeting_starting_enabled: !!s.meeting_starting_enabled,
    // Clamped to a sane window: below the cron's own cadence the message would
    // never fire, and beyond a few hours it stops meaning "starting soon".
    meeting_starting_lead_minutes: Number.isFinite(leadMinutes)
      ? Math.min(360, Math.max(15, Math.round(leadMinutes)))
      : 70,
    updated_at: new Date().toISOString(),
  };
  if (typeof s.access_token === 'string' && s.access_token.length > 0) {
    update.access_token = s.access_token.trim();
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('whatsapp_settings').upsert(update);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
