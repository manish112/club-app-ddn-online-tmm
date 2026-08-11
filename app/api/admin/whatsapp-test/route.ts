import { NextRequest, NextResponse } from 'next/server';
import { isAdminMember } from '@/lib/admin-auth';
import { sendWhatsAppTest, type WhatsAppSettings } from '@/lib/whatsapp/client';
import { buildWaPreviewVars } from '@/lib/whatsapp/notifications';
import { WA_TEMPLATE_KEYS, type WaTemplateKey } from '@/lib/whatsapp/defaults';

// Send a test WhatsApp message. Two modes:
//  - 'template' → send one of the configured, Meta-approved templates filled
//    with real preview data. Reaches anyone.
//  - 'text' → send free-form text. Only delivered if the recipient messaged the
//    business number in the last 24 hours; otherwise Meta rejects it and the
//    error comes straight back to the admin.
// `settings` overrides the stored config so credentials can be verified before
// they're saved.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const to = String(body.to ?? '').trim();
  if (!to) return NextResponse.json({ error: 'Recipient number required' }, { status: 400 });

  const mode: 'text' | 'template' = body.mode === 'template' ? 'template' : 'text';

  const override = body.settings as Partial<WhatsAppSettings> | undefined;
  // A blank token in the override means "use the stored one".
  if (override && !override.access_token) delete override.access_token;

  let templateKey: WaTemplateKey | undefined;
  if (mode === 'template') {
    templateKey = body.templateKey as WaTemplateKey;
    if (!WA_TEMPLATE_KEYS.includes(templateKey)) {
      return NextResponse.json({ error: 'Unknown template key' }, { status: 400 });
    }
  }

  const result = await sendWhatsAppTest({
    to,
    mode,
    text: body.text,
    templateKey,
    vars: mode === 'template' ? await buildWaPreviewVars(body.memberId) : undefined,
    override,
  });

  if ('error' in result) return NextResponse.json(result, { status: 500 });
  if ('skipped' in result) return NextResponse.json({ error: result.skipped }, { status: 400 });
  return NextResponse.json(result);
}
