import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { resolveTemplate, sendCustomEmail, getAppUrl, getEmailSettings, type EmailAttachment } from '@/lib/email/mailer';
import { fillTemplate } from '@/lib/email/render';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Pull base64 data-URI <img> out of the HTML into CID attachments (embedded
// images render reliably across email clients, unlike data: URIs in Gmail).
function inlineImages(html: string): { html: string; attachments: EmailAttachment[] } {
  const attachments: EmailAttachment[] = [];
  let i = 0;
  const out = html.replace(/src="data:(image\/[a-zA-Z0-9.+-]+);base64,([^"]+)"/g, (_m, mime: string, b64: string) => {
    const cid = `img${i++}@ddntm`;
    const ext = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    attachments.push({ filename: `image-${i}.${ext}`, content: Buffer.from(b64, 'base64'), cid, contentType: mime });
    return `src="cid:${cid}"`;
  });
  return { html: out, attachments };
}

// Admin writes a rich message (bold/italic/images) → emailed individually to
// every opted-in member, personalized with "Dear TM <name>".
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const subject = String(body.subject ?? '').trim();
  const rawHtml = String(body.html ?? '').trim();
  if (!subject || !rawHtml) return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });

  const settings = await getEmailSettings();
  if (!settings || !settings.enabled) return NextResponse.json({ error: 'Email is disabled in settings' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select('id, name, display_name, email, active, email_notifications');
  const active = (members ?? []).filter((m) => m.active && m.email && m.email_notifications !== false);
  if (active.length === 0) return NextResponse.json({ ok: true, recipients: 0 });

  const tpl = await resolveTemplate('custom_message');
  const { html: bodyHtml, attachments } = inlineImages(rawHtml);
  const appUrl = await getAppUrl();

  let sent = 0;
  for (const m of active) {
    const vars = {
      club_name: CLUB_NAME, app_url: appUrl,
      full_name: m.name || m.display_name, subject, message_body: bodyHtml,
    };
    const res = await sendCustomEmail(
      m.email as string,
      fillTemplate(tpl.subject, vars),
      fillTemplate(tpl.body_html, vars),
      undefined,
      attachments,
    );
    if ('ok' in res) sent++;
  }
  return NextResponse.json({ ok: true, recipients: sent });
}
