import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendMass, getAppUrl } from '@/lib/email/mailer';
import { formatDate, formatTime } from '@/lib/email/format';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Notify all members that a meeting was cancelled. Details are passed in because
// the meeting row is deleted at the call site.
export async function POST(req: NextRequest) {
  try {
    const { meetingNumber, meetingDate, startTime, endTime, meetingTheme } = await req.json() as {
      meetingNumber: number; meetingDate: string; startTime?: string; endTime?: string; meetingTheme?: string | null;
    };
    if (!meetingNumber || !meetingDate) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: members } = await supabase.from('members').select('email, active');
    const recipients = (members ?? []).filter((m) => m.active && m.email).map((m) => m.email as string);
    if (recipients.length === 0) return NextResponse.json({ skipped: 'no recipients' });

    const time = startTime && endTime ? `${formatTime(startTime)}–${formatTime(endTime)}` : '';
    const result = await sendMass('meeting_cancelled', recipients, {
      club_name: CLUB_NAME,
      app_url: await getAppUrl(),
      meeting_number: String(meetingNumber),
      meeting_date: formatDate(meetingDate),
      meeting_time: time,
      meeting_theme: meetingTheme && meetingTheme !== 'TBD' ? meetingTheme : 'To be decided',
    });
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json({ ok: true, recipients: recipients.length });
  } catch (err) {
    console.error('[notify-meeting-cancelled] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
