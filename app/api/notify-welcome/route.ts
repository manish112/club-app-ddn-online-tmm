import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendOne, getAppUrl } from '@/lib/email/mailer';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Send a welcome email to a newly added member.
export async function POST(req: NextRequest) {
  try {
    const { targetMemberId } = await req.json() as { targetMemberId: string };
    if (!targetMemberId) return NextResponse.json({ error: 'Missing targetMemberId' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: target } = await supabase
      .from('members').select('id, name, display_name, email').eq('id', targetMemberId).single();
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!target.email) return NextResponse.json({ skipped: 'no email' });

    const result = await sendOne('welcome', target.email, {
      club_name: CLUB_NAME,
      app_url: await getAppUrl(),
      full_name: target.name || target.display_name,
    });
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[notify-welcome] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
