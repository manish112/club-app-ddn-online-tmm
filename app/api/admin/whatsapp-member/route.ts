import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { WA_TEMPLATE_LABELS, type WaTemplateKey } from '@/lib/whatsapp/defaults';
import {
  waMemberSendOptions, waMemberSendRoster, waSendDirectText, waSendToMember,
} from '@/lib/whatsapp/notifications';

// WhatsApp to ONE member, from that member's row in the admin panel.
//
// Separate from whatsapp-send (which broadcasts to everyone reachable) because
// the decision is a different one: this exists for the club that pays per
// message and wants to reach exactly one person — the member whose WhatsApp an
// admin has just switched on, and nobody else.

// GET without `targetId`: who can be picked as the recipient.
// GET with one: what could be sent to that member right now, and why anything
// else can't. Both are answered before the admin commits, so an impossible send
// is a greyed-out option with a reason on it rather than an error afterwards.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  const targetId = req.nextUrl.searchParams.get('targetId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!targetId) {
    const roster = await waMemberSendRoster();
    return NextResponse.json(roster);
  }

  try {
    const data = await waMemberSendOptions(targetId);
    return NextResponse.json({ ...data, labels: WA_TEMPLATE_LABELS });
  } catch (err) {
    console.error('[whatsapp-member] Could not build send options:', err);
    // Almost always migration 058 missing on this database — the member select
    // names a column that isn't there yet.
    return NextResponse.json(
      { error: 'Could not read this member — has migration 058 been applied?' },
      { status: 500 },
    );
  }
}

// POST: send it. Either one of the templates (`key`), or free text (`text`).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetId = String(body.targetMemberId ?? '');
  if (!targetId) return NextResponse.json({ error: 'Missing targetMemberId' }, { status: 400 });

  try {
    // The admin is named in the role messages' "who did this" line, the same way
    // a real assignment names them — a message that reads "This was done by
    // Admin TM …" is worth more than one that leaves the member guessing.
    const supabase = createServiceClient();
    const { data: actor } = await supabase.from('members')
      .select('display_name').eq('id', body.memberId).single();

    const result = typeof body.text === 'string' && body.text.trim()
      ? await waSendDirectText({ memberId: targetId, text: String(body.text) })
      : await waSendToMember({
          memberId: targetId,
          key: body.key as WaTemplateKey,
          actor: actor ? { display_name: actor.display_name as string } : null,
        });

    return NextResponse.json(result as Record<string, unknown>);
  } catch (err) {
    console.error('[whatsapp-member] Send failed:', err);
    return NextResponse.json({ error: 'Could not send the message' }, { status: 500 });
  }
}
