// Meta's delivery callbacks for WhatsApp.
//
// The POST to Meta returns HTTP 200 and a message id the moment Meta accepts a
// message — not when it arrives. Delivery, and every way it can fail, is
// reported here and nowhere else: a number not on WhatsApp, a member who blocked
// the sender, a marketing-category template Meta decided to pace. Without this
// route a send that vanished and a send that landed look identical in the log.
//
// Setup (once):
//   1. Set WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET in Vercel.
//   2. Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit:
//        Callback URL   https://ddn.toastmasters.in/api/whatsapp-webhook
//        Verify token   the same value as WHATSAPP_VERIFY_TOKEN
//   3. Subscribe the WABA to the `messages` field (the button below the URL).
//      Statuses arrive on `messages` too — there is no separate field for them.
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/utils/supabase/server';

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
      entry?: { changes?: { value?: { statuses?: MetaStatus[] } }[] }[];
    };

    const statuses = (body.entry ?? [])
      .flatMap((e) => e.changes ?? [])
      .flatMap((c) => c.value?.statuses ?? [])
      .filter((s) => s.id && s.status);

    if (statuses.length) await recordStatuses(statuses);
  } catch {
    // Inbound messages, template-quality events and account updates all arrive
    // on this same subscription. Nothing here handles them, and that is fine.
  }

  return NextResponse.json({ ok: true });
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
  const { data: rows } = await supabase
    .from('whatsapp_sends')
    .select('id, wa_message_id, delivery_status')
    .in('wa_message_id', ids);

  for (const row of rows ?? []) {
    const s = latest.get(row.wa_message_id as string);
    if (!s) continue;

    const incoming = RANK[s.status as string] ?? 0;
    const current = RANK[(row.delivery_status as string) ?? ''] ?? 0;
    if (incoming <= current) continue;   // an out-of-order or replayed callback

    await supabase.from('whatsapp_sends').update({
      delivery_status: s.status,
      delivery_error: describe(s),
      delivery_at: s.timestamp
        ? new Date(Number(s.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    }).eq('id', row.id);
  }

  // A status for a message we have no row for is normal — the admin test box
  // sends without logging, by design.
}
