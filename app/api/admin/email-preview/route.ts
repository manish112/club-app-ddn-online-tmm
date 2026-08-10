import { NextRequest, NextResponse } from 'next/server';
import { isAdminMember } from '@/lib/admin-auth';
import { resolveTemplate } from '@/lib/email/mailer';
import { buildPreviewVars } from '@/lib/email/notifications';
import { fillTemplate } from '@/lib/email/render';
import { decodeEntities } from '@/lib/email/format';
import { TEMPLATE_KEYS, type TemplateKey } from '@/lib/email/defaults';

// Render a template with REAL data (next meeting, actual roles, configured app
// URL, admin's name) for on-screen preview. Uses the supplied subject/body when
// present so unsaved edits preview too, else the stored/default template.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = body.templateKey as TemplateKey;
  if (!TEMPLATE_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown template key' }, { status: 400 });
  }

  const tpl = await resolveTemplate(key);
  const subject = String(body.subject ?? '').trim() || tpl.subject;
  const html = String(body.body_html ?? '').trim() || tpl.body_html;

  // With a target member the preview is personalised to them — their name, and
  // their own role at the meeting where the template shows one.
  const vars = await buildPreviewVars(body.memberId, body.targetMemberId);
  return NextResponse.json({
    subject: decodeEntities(fillTemplate(subject, vars)),
    html: fillTemplate(html, vars),
  });
}
