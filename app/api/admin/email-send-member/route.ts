import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { resolveTemplate, sendCustomEmail } from '@/lib/email/mailer';
import { buildPreviewVars } from '@/lib/email/notifications';
import { fillTemplate } from '@/lib/email/render';
import { TEMPLATE_KEYS, CONSENT_EXEMPT_TEMPLATE_KEYS, type TemplateKey } from '@/lib/email/defaults';

// Manually send one template to a single chosen member, personalized to them
// and using the next meeting's real details.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const templateKey = body.templateKey as TemplateKey;
  const targetMemberId = String(body.targetMemberId ?? '');
  if (!TEMPLATE_KEYS.includes(templateKey)) {
    return NextResponse.json({ error: 'Unknown template key' }, { status: 400 });
  }
  if (!targetMemberId) return NextResponse.json({ error: 'Pick a member' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: target } = await supabase
    .from('members')
    .select('id, name, display_name, email, email_consent_status, email_notifications')
    .eq('id', targetMemberId).single();
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  if (!target.email) return NextResponse.json({ error: `TM ${target.display_name} has no email on file` }, { status: 400 });

  // This tool sends straight through sendCustomEmail (not the deliver() gate
  // in lib/email/mailer.ts), so it has to re-check consent itself — same rule
  // as deliver(): every template except the compliance receipts requires a
  // granted, unmuted opt-in, or a manual send here would be exactly the
  // "email anyone regardless of their choice" bug deliver() exists to prevent.
  if (!CONSENT_EXEMPT_TEMPLATE_KEYS.includes(templateKey)) {
    if (target.email_consent_status !== 'granted' || target.email_notifications === false) {
      return NextResponse.json(
        { error: `TM ${target.display_name} has not consented to email, or has muted it` },
        { status: 400 },
      );
    }
  }

  const tpl = await resolveTemplate(templateKey);
  const vars = await buildPreviewVars(body.memberId, targetMemberId);
  const result = await sendCustomEmail(
    target.email,
    fillTemplate(tpl.subject, vars),
    fillTemplate(tpl.body_html, vars),
  );
  if ('error' in result) return NextResponse.json(result, { status: 500 });
  return NextResponse.json({ ok: true, sentTo: target.email });
}
