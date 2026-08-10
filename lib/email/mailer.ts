import nodemailer from 'nodemailer';
import { createServiceClient } from '@/utils/supabase/server';
import { DEFAULT_TEMPLATES, type TemplateKey } from './defaults';
import { fillTemplate, type TemplateVars } from './render';
import { decodeEntities } from './format';

export interface EmailSettings {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  app_url: string;
  day_before_enabled: boolean;
  day_before_meeting_enabled: boolean;
  hour_before_enabled: boolean;
  open_roles_enabled: boolean;
  // Lead times in days before the meeting, so the invitation tracks the club's
  // schedule. More than one means it goes out more than once.
  open_roles_days_before: number[];
}

export const DEFAULT_APP_URL = 'https://dehradun-online-tm.vercel.app';

export async function getEmailSettings(): Promise<EmailSettings | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('email_settings').select('*').eq('id', 1).single();
  return (data as EmailSettings) ?? null;
}

// Display name of the current VP Education (for the email signature). Best-effort:
// empty string if none set or the leadership column isn't available.
export async function getVpEducationName(): Promise<string> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('members').select('display_name, leadership_roles, active');
    const vp = (data ?? []).find((m) => m.active && (m.leadership_roles ?? []).includes('vp_education'));
    return vp?.display_name ?? '';
  } catch {
    return '';
  }
}

// Everyone who reviews member requests: Club President, VP Education and any
// member flagged as an admin. De-duplicated, active members only. Best-effort —
// an empty list just means nobody gets the "needs approval" mail.
export async function getApproverEmails(): Promise<string[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('members').select('email, is_admin, leadership_roles, active');
    const emails = (data ?? [])
      .filter((m) => m.active !== false)
      .filter((m) => {
        const roles: string[] = m.leadership_roles ?? [];
        return m.is_admin === true || roles.includes('president') || roles.includes('vp_education');
      })
      .map((m) => String(m.email ?? '').trim().toLowerCase())
      .filter((e) => /.+@.+\..+/.test(e));
    return [...new Set(emails)];
  } catch {
    return [];
  }
}

// The public app URL for email links: admin-configured value, else env, else default.
export async function getAppUrl(): Promise<string> {
  const s = await getEmailSettings();
  const url = s?.app_url?.trim() || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
  return url.replace(/\/+$/, '');
}

// Resolve a template's subject/body/enabled: admin override if non-empty, else
// the built-in default from defaults.ts.
export async function resolveTemplate(key: TemplateKey): Promise<{ subject: string; body_html: string; enabled: boolean }> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('email_templates').select('subject, body_html, enabled').eq('key', key).single();
  const def = DEFAULT_TEMPLATES[key];
  return {
    subject: (data?.subject?.trim()) || def.subject,
    body_html: (data?.body_html?.trim()) || def.body_html,
    enabled: data?.enabled ?? true,
  };
}

function buildTransport(s: EmailSettings) {
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: s.smtp_port,
    secure: s.smtp_secure,
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
  });
}

function fromHeader(s: EmailSettings): string {
  return s.from_name ? `"${s.from_name}" <${s.from_email}>` : s.from_email;
}

const isEmail = (e: string | null | undefined): e is string => !!e && /.+@.+\..+/.test(e);

export type SendResult = { ok: true } | { skipped: string } | { error: string };

export interface IcalEvent { method: string; content: string; filename?: string }

interface DeliverOpts {
  key: TemplateKey;
  vars: TemplateVars;
  to?: string;            // 1:1 recipient
  bcc?: string[];         // mass recipients (BCC)
  dedupeKey?: string;     // when set, a unique email_sends row guards against re-sends
  meetingId?: string | null;
  icalEvent?: IcalEvent;  // attach a calendar invite (.ics)
}

async function deliver(opts: DeliverOpts): Promise<SendResult> {
  const { key, vars, dedupeKey, meetingId } = opts;
  const supabase = createServiceClient();

  const settings = await getEmailSettings();
  if (!settings || !settings.enabled) return { skipped: 'email disabled' };
  if (!settings.smtp_host || !settings.from_email) return { skipped: 'email not configured' };

  const tpl = await resolveTemplate(key);
  if (!tpl.enabled) return { skipped: `template ${key} disabled` };

  const to = isEmail(opts.to) ? opts.to : undefined;
  let bcc = (opts.bcc ?? []).filter(isEmail);
  if (!to && bcc.length === 0) return { skipped: 'no valid recipients' };

  // Respect per-member email opt-out (members who unchecked "Send me email notifications").
  const { data: optedRows } = await supabase.from('members').select('email').eq('email_notifications', false);
  const blocked = new Set((optedRows ?? []).map((m) => String(m.email ?? '').toLowerCase()).filter(Boolean));
  if (to && blocked.has(to.toLowerCase())) return { skipped: 'recipient opted out' };
  bcc = bcc.filter((e) => !blocked.has(e.toLowerCase()));
  if (!to && bcc.length === 0) return { skipped: 'all recipients opted out' };

  const recipientCount = to ? 1 : bcc.length;

  // Idempotency: claim the dedupe key first. A unique violation means an earlier
  // run already sent this, so skip (prevents duplicate reminder blasts).
  if (dedupeKey) {
    const { error } = await supabase.from('email_sends').insert({
      dedupe_key: dedupeKey, template_key: key, meeting_id: meetingId ?? null,
      recipient_count: recipientCount, status: 'sent',
    });
    if (error) return { skipped: 'duplicate' };
  }

  const allVars = { vp_education_name: await getVpEducationName(), ...vars };
  const subject = decodeEntities(fillTemplate(tpl.subject, allVars));
  const html = fillTemplate(tpl.body_html, allVars);

  try {
    const transport = buildTransport(settings);
    await transport.sendMail({
      from: fromHeader(settings),
      to: to ?? fromHeader(settings),   // BCC-only mail still needs a To header
      bcc: bcc.length ? bcc : undefined,
      replyTo: settings.reply_to || undefined,
      subject,
      html,
      icalEvent: opts.icalEvent
        ? { method: opts.icalEvent.method, filename: opts.icalEvent.filename ?? 'invite.ics', content: opts.icalEvent.content }
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed';
    if (dedupeKey) {
      await supabase.from('email_sends').update({ status: 'error', error: message }).eq('dedupe_key', dedupeKey);
    } else {
      await supabase.from('email_sends').insert({
        template_key: key, meeting_id: meetingId ?? null,
        recipient_count: recipientCount, status: 'error', error: message,
      });
    }
    return { error: message };
  }

  if (!dedupeKey) {
    await supabase.from('email_sends').insert({
      template_key: key, meeting_id: meetingId ?? null, recipient_count: recipientCount, status: 'sent',
    });
  }
  return { ok: true };
}

// 1:1 email — greets "Dear TM {{full_name}}". `vars.full_name` should be set.
export function sendOne(
  key: TemplateKey, toEmail: string, vars: TemplateVars, meetingId?: string | null, icalEvent?: IcalEvent,
): Promise<SendResult> {
  return deliver({ key, vars, to: toEmail, meetingId, icalEvent });
}

// Mass email — all recipients go in BCC.
export function sendMass(
  key: TemplateKey, recipients: string[], vars: TemplateVars,
  opts?: { dedupeKey?: string; meetingId?: string | null },
): Promise<SendResult> {
  return deliver({ key, vars, bcc: recipients, dedupeKey: opts?.dedupeKey, meetingId: opts?.meetingId });
}

// Same as sendOne but supports a dedupe key (used by the reminders) and an
// optional calendar invite.
export function sendOneDeduped(
  key: TemplateKey, toEmail: string, vars: TemplateVars,
  opts: { dedupeKey: string; meetingId?: string | null; icalEvent?: IcalEvent },
): Promise<SendResult> {
  return deliver({ key, vars, to: toEmail, dedupeKey: opts.dedupeKey, meetingId: opts.meetingId, icalEvent: opts.icalEvent });
}

// Send a one-off email with a given subject/html using the current (or provided)
// settings, bypassing templates and the send log. Used for test/preview sends.
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
  contentType?: string;
}

export async function sendCustomEmail(
  toEmail: string, subject: string, html: string,
  override?: Partial<EmailSettings>, attachments?: EmailAttachment[],
): Promise<SendResult> {
  const stored = await getEmailSettings();
  const settings = { ...stored, ...override } as EmailSettings;
  if (!settings.smtp_host || !settings.from_email) return { error: 'SMTP host and from address are required' };
  if (!isEmail(toEmail)) return { error: 'Invalid recipient address' };
  try {
    const transport = buildTransport(settings);
    await transport.sendMail({
      from: fromHeader(settings),
      to: toEmail,
      replyTo: settings.reply_to || undefined,
      subject,
      html,
      attachments: attachments && attachments.length ? attachments : undefined,
    });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'send failed' };
  }
}

// Generic connection test — verifies SMTP works, independent of any template.
export function sendTestEmail(toEmail: string, override?: Partial<EmailSettings>): Promise<SendResult> {
  return sendCustomEmail(
    toEmail,
    '✅ Test email — Dehradun Online Toastmasters',
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
      <h2 style="color:#9d1530;">SMTP is working 🎉</h2>
      <p style="color:#475569;">If you're reading this, your email connection settings are configured correctly.</p>
    </div>`,
    override,
  );
}
