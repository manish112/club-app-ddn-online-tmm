import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { getWhatsAppSettings } from '@/lib/whatsapp/client';
import { normalizePhone } from '@/lib/phone';
import { WA_LOG_LABELS } from '@/lib/whatsapp/defaults';

// Every WhatsApp send is written to whatsapp_sends — this reads it back.
//
// The log stores the recipient as bare E.164 digits, which is what Meta needs
// but not what an admin can act on: "919876543210" tells you nothing about who
// stopped receiving reminders. So member names are resolved here by normalising
// each member's stored phone through the same rule the sender used, and matching
// on the result. A number with no match is shown as-is — a former member, or a
// test send to the admin's own phone.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 60;
  const errorsOnly = req.nextUrl.searchParams.get('errorsOnly') === '1';

  const supabase = createServiceClient();

  const BASE_COLS = 'id, created_at, template_key, status, error, recipient, wa_message_id, meeting:meetings(number)';
  const DELIVERY_COLS = 'delivery_status, delivery_error, delivery_at';

  // Two selects, because migration 057 may not have reached this database yet
  // and a log that refuses to load is worse than one missing a column. The
  // second is the pre-057 shape.
  function build(withDelivery: boolean) {
    const q = supabase
      .from('whatsapp_sends')
      .select(withDelivery ? `${BASE_COLS}, ${DELIVERY_COLS}` : BASE_COLS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!errorsOnly) return q;
    // A message Meta accepted and then failed to deliver is a failure too — and
    // the only kind the sender itself never sees.
    return withDelivery
      ? q.or('status.eq.error,delivery_status.eq.failed')
      : q.eq('status', 'error');
  }

  let { data: rows, error } = await build(true);
  if (error) ({ data: rows, error } = await build(false));

  const [{ data: members }, settings] = await Promise.all([
    supabase.from('members').select('display_name, name, phone'),
    getWhatsAppSettings(),
  ]);

  if (error) {
    // Almost always the table not existing yet — say which migration, rather
    // than showing an empty log that looks like "nothing has ever been sent".
    return NextResponse.json(
      { error: 'Could not read the message log — has migration 055 been applied?' },
      { status: 500 },
    );
  }

  const cc = settings?.default_country_code ?? '91';
  const nameByNumber = new Map<string, string>();
  for (const m of members ?? []) {
    const e164 = normalizePhone(m.phone as string | null, cc);
    if (e164 && !nameByNumber.has(e164)) {
      nameByNumber.set(e164, (m.display_name as string) || (m.name as string));
    }
  }

  type Row = {
    id: string; created_at: string; template_key: string | null;
    status: string; error: string | null; recipient: string | null;
    wa_message_id: string | null; meeting: { number: number } | null;
    delivery_status?: string | null; delivery_error?: string | null; delivery_at?: string | null;
  };

  const entries = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    at: r.created_at,
    templateKey: r.template_key,
    templateLabel: r.template_key
      ? WA_LOG_LABELS[r.template_key] ?? r.template_key
      : 'Unknown',
    status: r.status,
    error: r.error,
    recipient: r.recipient,
    memberName: r.recipient ? nameByNumber.get(r.recipient) ?? null : null,
    meetingNumber: r.meeting?.number ?? null,
    waMessageId: r.wa_message_id,
    // Null until Meta calls the webhook back — which it only does once the
    // callback URL is configured. Shown as "awaiting confirmation" rather than
    // silently as success.
    deliveryStatus: r.delivery_status ?? null,
    deliveryError: r.delivery_error ?? null,
    deliveryAt: r.delivery_at ?? null,
  }));

  // Counts over the last 24 hours, so an admin opening the tab after a cron run
  // sees at a glance whether it went out — without reading every row.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => new Date(e.at).getTime() >= dayAgo);

  return NextResponse.json({
    entries,
    last24h: {
      sent: recent.filter((e) => e.status === 'sent').length,
      // Rejected at the door, plus accepted and then dropped on the way.
      failed: recent.filter((e) => e.status === 'error' || e.deliveryStatus === 'failed').length,
      delivered: recent.filter((e) => e.deliveryStatus === 'delivered' || e.deliveryStatus === 'read').length,
    },
  });
}
