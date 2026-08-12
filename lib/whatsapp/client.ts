// Meta (WhatsApp Cloud API) transport. Mirrors lib/email/mailer.ts: settings and
// templates live in service-role-only tables, delivery is deduped through a send
// log, and every send returns a reason rather than throwing.
//
// The one rule that shapes everything here: a business-initiated WhatsApp
// message must use a template Meta approved beforehand. Plain text only reaches
// someone who messaged the business in the last 24 hours — that's `text_mode`,
// which exists for testing and is never what a scheduled reminder should use.
import { createServiceClient } from '@/utils/supabase/server';
import { WA_DEFAULT_TEMPLATES, WA_PARAM_VARS, type WaTemplateKey } from './defaults';
import { fillTemplate, type TemplateVars } from '@/lib/email/render';

// Lives in lib/phone.ts, free of server-only imports, so the admin UI can warn
// about an unusable number using this exact rule. Imported for use below and
// re-exported because every server caller already reaches for it here.
import { normalizePhone } from '@/lib/phone';
export { normalizePhone };

export interface WhatsAppSettings {
  enabled: boolean;
  access_token: string;
  phone_number_id: string;
  api_version: string;
  default_country_code: string;
  text_mode: boolean;
  welcome_enabled: boolean;
  meeting_created_enabled: boolean;
  role_change_enabled: boolean;      // covers both role_assigned and role_removed
  role_reminder_enabled: boolean;
  no_role_nudge_enabled: boolean;
  meeting_starting_enabled: boolean;
  meeting_starting_lead_minutes: number;
}

export async function getWhatsAppSettings(): Promise<WhatsAppSettings | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('whatsapp_settings').select('*').eq('id', 1).single();
  return (data as WhatsAppSettings) ?? null;
}

// ── Templates ───────────────────────────────────────────────────────────────

export interface ResolvedWaTemplate {
  template_name: string;
  language_code: string;
  body_text: string;
  param_vars: string[];
  enabled: boolean;
}

// Admin override where set, built-in default otherwise — the same fallback rule
// the email templates use.
export async function resolveWaTemplate(key: WaTemplateKey): Promise<ResolvedWaTemplate> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('whatsapp_templates')
    .select('template_name, language_code, body_text, param_vars, enabled')
    .eq('key', key).single();
  const paramVars = Array.isArray(data?.param_vars) && data.param_vars.length
    ? (data.param_vars as string[])
    : WA_PARAM_VARS[key];
  return {
    template_name: (data?.template_name ?? '').trim(),
    language_code: (data?.language_code ?? '').trim() || 'en',
    body_text: (data?.body_text?.trim()) || WA_DEFAULT_TEMPLATES[key],
    param_vars: paramVars,
    enabled: data?.enabled ?? true,
  };
}

// Meta rejects a body parameter containing a newline, a tab or a run of more
// than four spaces, and rejects an empty one outright. Flatten rather than fail:
// a reminder that arrives with a squashed theme beats one that never arrives.
export function sanitizeParam(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{4,}/g, ' ').trim();
  return flat || '-';
}

// The body as a member will read it — placeholders filled, used for text mode
// and for the admin preview.
export function renderBody(tpl: ResolvedWaTemplate, vars: TemplateVars): string {
  return fillTemplate(tpl.body_text, vars);
}

// The positional parameters Meta expects, drawn from the template's variable
// order. Shown in the admin panel too, so what's previewed is what's posted.
export function buildParams(tpl: ResolvedWaTemplate, vars: TemplateVars): string[] {
  return tpl.param_vars.map((name) => sanitizeParam(vars[name] ?? ''));
}

// The body text an admin submits to Meta for approval: our named placeholders
// swapped for the numbered ones Meta uses, in the configured order.
//
// One occurrence at a time, walking the parameter list in order — a variable
// may legitimately appear twice (the welcome message names the VP Education
// mid-sentence and again in the sign-off), and Meta wants those as two separate
// numbered parameters carrying the same value. Replacing globally would collapse
// both onto the first number and leave the second unfilled.
export function toMetaBody(tpl: ResolvedWaTemplate): string {
  let body = tpl.body_text;
  tpl.param_vars.forEach((name, i) => {
    body = body.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`), `{{${i + 1}}}`);
  });
  // Any placeholder left over isn't mapped to a parameter, so Meta would never
  // fill it — strip it rather than ship literal braces to a member. Matched on a
  // leading letter or underscore so it can't eat the {{1}}, {{2}}… just written:
  // our names always start with one, Meta's numbers never do.
  return body.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '');
}

// ── Raw transport ───────────────────────────────────────────────────────────

export type WaSendResult = { ok: true; messageId?: string } | { skipped: string } | { error: string };

function graphUrl(s: WhatsAppSettings): string {
  const version = (s.api_version || 'v25.0').replace(/^\/+|\/+$/g, '');
  return `https://graph.facebook.com/${version}/${s.phone_number_id}/messages`;
}

// Meta's error text names the symptom, not the cause. "Template name does not
// exist in the translation" is the same message whether the template is still in
// review, the name is misspelt, or the language code doesn't match — three very
// different fixes. Add the likely cause so an admin isn't left guessing.
const META_ERROR_HINTS: Record<number, string> = {
  132001: 'Check the template in Meta: it must show Active/Approved (not "In review"), '
    + 'the approved name must match exactly, and its language must match the code set here.',
  132000: 'The number of parameters sent does not match the template. Count the {{1}}, {{2}}… '
    + 'in the approved body and make the parameter order below the same length.',
  132005: 'A parameter is too long for the template, or the approved body has changed.',
  132012: 'A parameter contains something Meta rejects — a newline, a tab, or four or more spaces in a row.',
  131047: 'Free-form text only reaches someone who messaged your number in the last 24 hours. '
    + 'Turn off "send as plain text" and use an approved template instead.',
  131026: 'That number cannot receive the message — it may not be on WhatsApp, or not yet '
    + 'added as a recipient on a Meta test number.',
  131030: 'On a Meta test number you can only message the recipients listed in the API Setup page.',
  133010: 'The sending number is not registered for the Cloud API. Finish registration in Meta first.',
  190: 'The access token has expired or been revoked. Generate a new permanent System User token.',
  100: 'Meta rejected the request shape — usually a wrong phone number ID or Graph API version.',
};

async function postToMeta(s: WhatsAppSettings, payload: Record<string, unknown>): Promise<WaSendResult> {
  try {
    const res = await fetch(graphUrl(s), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data?.error ?? {};
      const detail = err.error_user_msg || err.message || `HTTP ${res.status}`;
      const hint = META_ERROR_HINTS[Number(err.code)];
      return { error: hint ? `${detail} — ${hint}` : String(detail) };
    }
    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'request failed' };
  }
}

// Send an approved template message. Works regardless of when the recipient
// last messaged the business — this is what every scheduled notification uses.
export function sendTemplateMessage(
  s: WhatsAppSettings, to: string, name: string, language: string, params: string[],
): Promise<WaSendResult> {
  return postToMeta(s, {
    to,
    type: 'template',
    template: {
      name,
      language: { code: language },
      // A template with no variables must not carry a components array at all —
      // Meta rejects an empty parameter list.
      ...(params.length
        ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
        : {}),
    },
  });
}

// Send free-form text. Only delivered inside the 24-hour customer-service
// window; outside it Meta returns error 131047 (re-engagement required).
export function sendTextMessage(s: WhatsAppSettings, to: string, body: string): Promise<WaSendResult> {
  return postToMeta(s, { to, type: 'text', text: { preview_url: true, body } });
}

// ── Delivery with opt-out, dedupe and logging ───────────────────────────────

interface DeliverOpts {
  key: WaTemplateKey;
  vars: TemplateVars;
  phone: string;            // raw, as stored on the member
  dedupeKey?: string;
  meetingId?: string | null;
}

export async function deliverWhatsApp(opts: DeliverOpts): Promise<WaSendResult> {
  const supabase = createServiceClient();

  const settings = await getWhatsAppSettings();
  if (!settings || !settings.enabled) return { skipped: 'whatsapp disabled' };
  if (!settings.access_token || !settings.phone_number_id) return { skipped: 'whatsapp not configured' };

  const tpl = await resolveWaTemplate(opts.key);
  if (!tpl.enabled) return { skipped: `template ${opts.key} disabled` };
  if (!settings.text_mode && !tpl.template_name) {
    return { skipped: `no approved template name set for ${opts.key}` };
  }

  const to = normalizePhone(opts.phone, settings.default_country_code);
  if (!to) return { skipped: 'no usable phone number' };

  // Claim the dedupe key before sending: a unique violation means an earlier run
  // already messaged this member, so stop here rather than message them twice.
  if (opts.dedupeKey) {
    const { error } = await supabase.from('whatsapp_sends').insert({
      dedupe_key: opts.dedupeKey, template_key: opts.key,
      meeting_id: opts.meetingId ?? null, recipient: to, status: 'sent',
    });
    if (error) return { skipped: 'duplicate' };
  }

  const result = settings.text_mode
    ? await sendTextMessage(settings, to, renderBody(tpl, opts.vars))
    : await sendTemplateMessage(settings, to, tpl.template_name, tpl.language_code, buildParams(tpl, opts.vars));

  if ('error' in result) {
    if (opts.dedupeKey) {
      // Leave the row so a failure is visible, but clear the dedupe key —
      // otherwise a transient API error would silently suppress the retry.
      await supabase.from('whatsapp_sends')
        .update({ dedupe_key: null, status: 'error', error: result.error })
        .eq('dedupe_key', opts.dedupeKey);
    } else {
      await supabase.from('whatsapp_sends').insert({
        template_key: opts.key, meeting_id: opts.meetingId ?? null,
        recipient: to, status: 'error', error: result.error,
      });
    }
    return result;
  }

  if ('ok' in result) {
    if (opts.dedupeKey) {
      await supabase.from('whatsapp_sends')
        .update({ wa_message_id: result.messageId ?? null }).eq('dedupe_key', opts.dedupeKey);
    } else {
      await supabase.from('whatsapp_sends').insert({
        template_key: opts.key, meeting_id: opts.meetingId ?? null,
        recipient: to, wa_message_id: result.messageId ?? null, status: 'sent',
      });
    }
  }
  return result;
}

// ── One-off sends (admin test) ──────────────────────────────────────────────

// Send to an arbitrary number using the given settings, bypassing the dedupe
// guard and the per-notification toggles. `override` lets an admin verify
// credentials before saving them.
//
// The result *is* written to the send log. A test send is the one an admin is
// actively watching, so it is the one whose delivery callback matters most —
// and a callback for a message with no row to attach to is thrown away.
export async function sendWhatsAppTest(params: {
  to: string;
  mode: 'text' | 'template';
  text?: string;
  templateKey?: WaTemplateKey;
  vars?: TemplateVars;
  override?: Partial<WhatsAppSettings>;
}): Promise<WaSendResult> {
  const stored = await getWhatsAppSettings();
  const settings = { ...stored, ...params.override } as WhatsAppSettings;
  if (!settings.access_token || !settings.phone_number_id) {
    return { error: 'Access token and phone number ID are required' };
  }

  const to = normalizePhone(params.to, settings.default_country_code);
  if (!to) return { error: 'That does not look like a valid phone number' };

  let result: WaSendResult;
  if (params.mode === 'text') {
    const body = (params.text ?? '').trim();
    if (!body) return { error: 'Message text is required' };
    result = await sendTextMessage(settings, to, body);
  } else {
    if (!params.templateKey) return { error: 'Pick a template to send' };
    const tpl = await resolveWaTemplate(params.templateKey);
    if (!tpl.template_name) return { error: 'No approved template name is set for this message' };
    result = await sendTemplateMessage(
      settings, to, tpl.template_name, tpl.language_code, buildParams(tpl, params.vars ?? {}),
    );
  }

  await createServiceClient().from('whatsapp_sends').insert({
    template_key: params.templateKey ?? null,
    recipient: to,
    wa_message_id: 'ok' in result ? result.messageId ?? null : null,
    status: 'error' in result ? 'error' : 'sent',
    error: 'error' in result ? result.error : null,
  });

  return result;
}
