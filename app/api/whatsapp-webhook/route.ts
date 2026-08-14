// Meta's callbacks for WhatsApp: delivery statuses, and inbound messages.
//
// The POST to Meta returns HTTP 200 and a message id the moment Meta accepts a
// message — not when it arrives. Delivery, and every way it can fail, is
// reported here and nowhere else: a number not on WhatsApp, a member who blocked
// the sender, a marketing-category template Meta decided to pace. Without this
// route a send that vanished and a send that landed look identical in the log.
//
// The same `messages` field also carries INBOUND messages — anyone who texts
// the club's number — which get an automatic reply with the next meeting's
// details (see waAutoReplyToInboundMessage).
//
// Setup (once):
//   1. Set WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET in Vercel.
//   2. Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit:
//        Callback URL   https://ddn.toastmasters.in/api/whatsapp-webhook
//        Verify token   the same value as WHATSAPP_VERIFY_TOKEN
//   3. Subscribe the WABA to the `messages` field (the button below the URL).
//      Statuses AND inbound messages both arrive on `messages` — there is no
//      separate field for either.
//   4. Subscribe the app itself to the club's WhatsApp Business Account
//      (WABA), not just its own `messages` field — the two are different
//      switches. The field says "this app wants these events"; the WABA
//      subscription says "this app may receive them". Missing the second one
//      looks identical to missing the first: Meta's own webhook Test button
//      still returns 200 either way, because Test bypasses WABA routing and
//      posts straight to the callback URL.
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/utils/supabase/server';
import { waAutoReplyToInboundMessage } from '@/lib/whatsapp/notifications';

// createHmac needs the Node runtime; the Edge runtime has no node:crypto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Verification handshake ──────────────────────────────────────────────────
// Meta calls this once when the callback URL is saved, and expects the challenge
// echoed back as bare text.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) return new NextResponse('WHATSAPP_VERIFY_TOKEN is not set', { status: 500 });
  if (params.get('hub.mode') !== 'subscribe' || params.get('hub.verify_token') !== expected) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(params.get('hub.challenge') ?? '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// Meta signs every callback with the app secret. Unsigned or wrongly signed
// requests are rejected — this endpoint is public, and without the check anyone
// could write delivery results into the log.
function signatureValid(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw, 'utf8').digest();
  const got = Buffer.from(header.slice('sha256='.length), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ── Status callbacks ────────────────────────────────────────────────────────

interface MetaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

// Callbacks are not ordered — 'read' routinely arrives before 'delivered', and a
// retry can replay an old one. Only ever move a row forward, so a late 'sent'
// can't erase the fact that the message was delivered.
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

// Meta's own wording is thin ("Message Undeliverable"), and the code is the part
// that actually distinguishes the causes. Both are kept, and the ones an admin
// will realistically hit get the explanation Meta leaves out.
const DELIVERY_HINTS: Record<number, string> = {
  131049: 'Meta chose not to deliver this one to limit marketing messages to this person. '
    + 'Marketing-category templates are paced per recipient — switch the template to Utility '
    + 'in WhatsApp Manager if it is a service message rather than a promotion.',
  131050: 'This person has opted out of marketing messages from your number.',
  131026: 'The message could not be delivered — the number may not be on WhatsApp, '
    + 'or it cannot receive messages from your business.',
  131047: 'Free-form text only reaches someone who messaged your number in the last 24 hours.',
  131048: 'Sending was restricted for quality reasons — the number is temporarily rate-limited by Meta.',
  132015: 'The template is paused because of poor quality, so Meta will not deliver it.',
  132016: 'The template was disabled by Meta and can no longer be sent.',
  130472: 'This person is part of an experiment group and was excluded from delivery.',
};

function describe(s: MetaStatus): string | null {
  const err = s.errors?.[0];
  if (!err) return null;
  const parts = [
    err.code != null ? `[${err.code}]` : null,
    err.title || err.message || 'Delivery failed',
    err.error_data?.details && err.error_data.details !== err.title ? `— ${err.error_data.details}` : null,
    err.code != null ? DELIVERY_HINTS[err.code] : null,
  ];
  return parts.filter(Boolean).join(' ');
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new NextResponse('WHATSAPP_APP_SECRET is not set', { status: 500 });
  if (!signatureValid(raw, req.headers.get('x-hub-signature-256'), secret)) {
    return new NextResponse('Bad signature', { status: 403 });
  }

  // Past this point always answer 200. Meta retries anything else with growing
  // backoff and eventually unsubscribes the webhook outright — losing every
  // future callback is a far worse outcome than dropping one malformed payload.
  try {
    const body = JSON.parse(raw) as {
      entry?: { changes?: { value?: { statuses?: MetaStatus[]; messages?: MetaInboundMessage[] } }[] }[];
    };
    const values = (body.entry ?? []).flatMap((e) => e.changes ?? []).map((c) => c.value);

    const statuses = values.flatMap((v) => v?.statuses ?? []).filter((s) => s.id && s.status);
    if (statuses.length) await recordStatuses(statuses);

    const messages = values.flatMap((v) => v?.messages ?? [])
      .filter((m): m is MetaInboundMessage & { from: string } => !!m.from);
    if (messages.length) await replyToInboundMessages(messages);
  } catch (err) {
    // Template-quality events and account updates also arrive on this same
    // subscription and are deliberately not handled — only a genuine parse or
    // handler failure is worth a log line here.
    console.error('[whatsapp-webhook] failed to process callback:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}

interface MetaInboundMessage {
  from?: string;   // sender's WhatsApp ID — Meta's own E.164 digits, no '+'
  id?: string;
}

// One reply per distinct sender in the batch — waAutoReplyToInboundMessage's
// own per-phone-per-day dedupe is what actually stops a burst of texts from
// producing a burst of replies; this just avoids firing that check twice for
// two messages that arrived in the same webhook delivery.
async function replyToInboundMessages(messages: MetaInboundMessage[]) {
  const senders = [...new Set(messages.map((m) => m.from as string))];
  for (const from of senders) {
    const res = await waAutoReplyToInboundMessage({ from });
    if ('error' in res) console.error('[whatsapp-webhook] auto-reply failed:', res.error);
  }
}

async function recordStatuses(statuses: MetaStatus[]) {
  const supabase = createServiceClient();

  // Keep only the furthest-along callback per message, so a payload carrying
  // both 'delivered' and 'read' costs one write rather than two.
  const latest = new Map<string, MetaStatus>();
  for (const s of statuses) {
    const prev = latest.get(s.id as string);
    if (!prev || (RANK[s.status as string] ?? 0) > (RANK[prev.status as string] ?? 0)) {
      latest.set(s.id as string, s);
    }
  }

  const ids = [...latest.keys()];
  const { data: rows, error } = await supabase
    .from('whatsapp_sends')
    .select('id, wa_message_id, delivery_status')
    .in('wa_message_id', ids);

  // Discarding this error once cost an afternoon: on a database missing the
  // delivery columns the select fails with 42703, `rows` comes back null, the
  // loop below runs zero times, and Meta is still answered 200 — so callbacks
  // kept arriving and nothing was ever recorded, at any layer, in silence.
  // Every failure here is now visible in the platform logs.
  if (error) {
    console.error('[whatsapp-webhook] could not read whatsapp_sends:', error.message,
      error.code === '42703'
        ? '— the delivery_status/delivery_error/delivery_at columns are missing from this database'
        : '');
    return;
  }

  // One line per callback batch, so "is Meta calling at all" is answerable from
  // the logs without a database round trip.
  console.log(`[whatsapp-webhook] ${ids.length} status(es) received, ${(rows ?? []).length} matched a send`);

  for (const row of rows ?? []) {
    const s = latest.get(row.wa_message_id as string);
    if (!s) continue;

    const incoming = RANK[s.status as string] ?? 0;
    const current = RANK[(row.delivery_status as string) ?? ''] ?? 0;
    if (incoming <= current) continue;   // an out-of-order or replayed callback

    const { error: updateError } = await supabase.from('whatsapp_sends').update({
      delivery_status: s.status,
      delivery_error: describe(s),
      delivery_at: s.timestamp
        ? new Date(Number(s.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    }).eq('id', row.id);

    if (updateError) {
      console.error('[whatsapp-webhook] could not record delivery status:', updateError.message);
    }
  }

  // A status for a message we have no row for is normal — the admin test box
  // sends without logging, by design.
}
