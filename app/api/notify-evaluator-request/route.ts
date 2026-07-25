import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendMass, getAppUrl } from '@/lib/email/mailer';
import { formatDate } from '@/lib/email/format';

const CLUB_NAME = 'Dehradun Online Toastmasters';

export async function POST(req: NextRequest) {
  try {
    const { meetingNumber, meetingDate, speakerId, preferredEvaluatorId } = await req.json() as {
      meetingNumber: number;
      meetingDate: string;
      speakerId: string;
      preferredEvaluatorId: string;
    };

    if (!meetingNumber || !meetingDate || !speakerId || !preferredEvaluatorId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: members } = await supabase
      .from('members')
      .select('id, display_name, email, leadership_roles');

    const byId = new Map((members ?? []).map((m) => [m.id, m]));
    const speaker = byId.get(speakerId);
    const evaluator = byId.get(preferredEvaluatorId);

    const officers = (members ?? []).filter((m) => {
      const roles: string[] = m.leadership_roles ?? [];
      return roles.includes('president') || roles.includes('vp_education');
    });
    const recipients = officers.map((o) => o.email).filter((e): e is string => !!e);
    if (recipients.length === 0) return NextResponse.json({ skipped: 'no officer emails' });

    const vars = {
      club_name: CLUB_NAME,
      app_url: await getAppUrl(),
      meeting_number: String(meetingNumber),
      meeting_date: formatDate(meetingDate),
      speaker_name: speaker?.display_name ?? 'A member',
      evaluator_name: evaluator?.display_name ?? 'someone',
    };

    const result = await sendMass('evaluator_request', recipients, vars);
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[notify-evaluator-request] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
