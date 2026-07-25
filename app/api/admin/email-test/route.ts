import { NextRequest, NextResponse } from 'next/server';
import { isAdminMember } from '@/lib/admin-auth';
import { sendTestEmail, sendCustomEmail, resolveTemplate, type EmailSettings } from '@/lib/email/mailer';
import { buildPreviewVars } from '@/lib/email/notifications';
import { fillTemplate } from '@/lib/email/render';
import { TEMPLATE_KEYS, type TemplateKey } from '@/lib/email/defaults';

// Send a test email. Two modes:
//  - templateKey given → render that template (using the supplied subject/body,
//    falling back to the stored/default one) with sample data and send it.
//  - otherwise → a plain connection test.
// If `settings` is supplied, they override the stored config so an admin can
// verify before saving.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const to = String(body.to ?? '').trim();
  if (!to) return NextResponse.json({ error: 'Recipient address required' }, { status: 400 });

  const override = body.settings as Partial<EmailSettings> | undefined;
  // A blank password in the override means "use the stored one".
  if (override && !override.smtp_pass) delete override.smtp_pass;

  const templateKey = body.templateKey as TemplateKey | undefined;
  if (templateKey) {
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      return NextResponse.json({ error: 'Unknown template key' }, { status: 400 });
    }
    const tpl = await resolveTemplate(templateKey);
    const subject = String(body.subject ?? '').trim() || tpl.subject;
    const html = String(body.body_html ?? '').trim() || tpl.body_html;
    const vars = await buildPreviewVars(body.memberId);
    const result = await sendCustomEmail(
      to,
      `[TEST] ${fillTemplate(subject, vars)}`,
      fillTemplate(html, vars),
      override,
    );
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  }

  const result = await sendTestEmail(to, override);
  if ('error' in result) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
}
