import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendOne, getAppUrl } from '@/lib/email/mailer';
import { waSendWelcome } from '@/lib/whatsapp/notifications';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Welcome a newly added member — by email, and on WhatsApp with the message that
// introduces the channel and says how to opt out of it.
export async function POST(req: NextRequest) {
  try {
    const { targetMemberId } = await req.json() as { targetMemberId: string };
    if (!targetMemberId) return NextResponse.json({ error: 'Missing targetMemberId' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: target } = await supabase
      .from('members').select('id, name, display_name, email').eq('id', targetMemberId).single();
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    // No email address is no reason to skip the WhatsApp welcome — the two
    // channels are configured, and populated, independently.
    const result = target.email
      ? await sendOne('welcome', target.email, {
          club_name: CLUB_NAME,
          app_url: await getAppUrl(),
          full_name: target.name || target.display_name,
        })
      : { skipped: 'no email' as const };

    let whatsapp: unknown;
    try {
      whatsapp = await waSendWelcome(targetMemberId);
    } catch (err) {
      console.error('[notify-welcome] WhatsApp send failed:', err);
      whatsapp = { error: 'whatsapp send failed' };
    }

    if ('error' in result) return NextResponse.json({ ...result, whatsapp }, { status: 500 });
    return NextResponse.json({ ...result, whatsapp });
  } catch (err) {
    console.error('[notify-welcome] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
