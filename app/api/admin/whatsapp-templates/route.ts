import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import {
  WA_DEFAULT_TEMPLATES, WA_MANUAL_SEND_KEYS, WA_MEETINGLESS_KEYS, WA_PARAM_VARS,
  WA_PLACEHOLDERS, WA_TEMPLATE_HINTS, WA_TEMPLATE_KEYS, WA_TEMPLATE_LABELS, type WaTemplateKey,
} from '@/lib/whatsapp/defaults';
import { buildParams, renderBody, resolveWaTemplate, toMetaBody } from '@/lib/whatsapp/client';
import { buildWaPreviewVars } from '@/lib/whatsapp/notifications';

// GET: every template row plus defaults, labels, placeholder help — and, for
// each kind, the two things an admin actually needs to get this working: the
// message as a member will read it, and the body to paste into Meta's template
// submission form with its {{1}}, {{2}}… numbering already applied.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase.from('whatsapp_templates').select('*');
  const vars = await buildWaPreviewVars(memberId ?? undefined);

  const previews: Record<string, { rendered: string; metaBody: string; params: string[] }> = {};
  for (const key of WA_TEMPLATE_KEYS) {
    const tpl = await resolveWaTemplate(key);
    previews[key] = {
      rendered: renderBody(tpl, vars),
      metaBody: toMetaBody(tpl),
      params: buildParams(tpl, vars),
    };
  }

  return NextResponse.json({
    templates: data ?? [],
    defaults: WA_DEFAULT_TEMPLATES,
    defaultParamVars: WA_PARAM_VARS,
    placeholders: WA_PLACEHOLDERS,
    labels: WA_TEMPLATE_LABELS,
    hints: WA_TEMPLATE_HINTS,
    keys: WA_TEMPLATE_KEYS,
    manualKeys: WA_MANUAL_SEND_KEYS,
    meetinglessKeys: WA_MEETINGLESS_KEYS,
    previews,
  });
}

// POST: upsert one template. An empty body_text resets it to the built-in
// default (the resolver falls back when the stored value is blank).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = body.key as WaTemplateKey;
  if (!WA_TEMPLATE_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown template key' }, { status: 400 });
  }

  // Only variables this kind actually knows about can be mapped to a parameter —
  // an unknown name would post an empty string to Meta and be rejected.
  const allowed = new Set(WA_PLACEHOLDERS[key]);
  const paramVars = (Array.isArray(body.param_vars) ? body.param_vars : [])
    .map((v: unknown) => String(v))
    .filter((v: string) => allowed.has(v));

  const supabase = createServiceClient();
  const { error } = await supabase.from('whatsapp_templates').upsert({
    key,
    template_name: String(body.template_name ?? '').trim(),
    language_code: String(body.language_code ?? '').trim() || 'en',
    body_text: String(body.body_text ?? ''),
    param_vars: paramVars.length ? paramVars : WA_PARAM_VARS[key],
    enabled: body.enabled ?? true,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
