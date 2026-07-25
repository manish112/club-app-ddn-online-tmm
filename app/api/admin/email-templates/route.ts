import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { DEFAULT_TEMPLATES, PLACEHOLDERS, TEMPLATE_KEYS, TEMPLATE_LABELS, type TemplateKey } from '@/lib/email/defaults';

// GET: all template rows plus the built-in defaults, labels and placeholder help
// so the admin editor can render, preview and reset each template.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data } = await supabase.from('email_templates').select('*');
  return NextResponse.json({
    templates: data ?? [],
    defaults: DEFAULT_TEMPLATES,
    placeholders: PLACEHOLDERS,
    labels: TEMPLATE_LABELS,
    keys: TEMPLATE_KEYS,
  });
}

// POST: upsert one template. Sending empty subject/body resets it to the default
// (the renderer falls back to DEFAULT_TEMPLATES when the stored value is blank).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = body.key as TemplateKey;
  if (!TEMPLATE_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown template key' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('email_templates').upsert({
    key,
    subject: String(body.subject ?? ''),
    body_html: String(body.body_html ?? ''),
    enabled: body.enabled ?? true,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
