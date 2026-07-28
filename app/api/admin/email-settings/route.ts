import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';

// GET: return settings with the password masked (never send it to the client).
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase.from('email_settings').select('*').eq('id', 1).single();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { smtp_pass, ...rest } = data;
  return NextResponse.json({ ...rest, hasPassword: !!smtp_pass });
}

// POST: update settings. A blank smtp_pass leaves the stored password unchanged.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = body.settings ?? {};
  const update: Record<string, unknown> = {
    id: 1,
    enabled: !!s.enabled,
    smtp_host: String(s.smtp_host ?? '').trim(),
    smtp_port: Number(s.smtp_port) || 587,
    smtp_secure: !!s.smtp_secure,
    smtp_user: String(s.smtp_user ?? '').trim(),
    from_name: String(s.from_name ?? '').trim(),
    from_email: String(s.from_email ?? '').trim(),
    reply_to: String(s.reply_to ?? '').trim(),
    app_url: String(s.app_url ?? '').trim().replace(/\/+$/, ''),
    day_before_enabled: !!s.day_before_enabled,
    day_before_meeting_enabled: !!s.day_before_meeting_enabled,
    hour_before_enabled: !!s.hour_before_enabled,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the password when a non-empty value was supplied.
  if (typeof s.smtp_pass === 'string' && s.smtp_pass.length > 0) {
    update.smtp_pass = s.smtp_pass;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('email_settings').upsert(update);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
