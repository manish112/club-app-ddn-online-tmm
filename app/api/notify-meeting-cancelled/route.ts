import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendOne, getAppUrl } from '@/lib/email/mailer';
import { cancellationReasonBlock } from '@/lib/email/notifications';
import { formatDate, formatTime } from '@/lib/email/format';
import { getWhatsAppSettings } from '@/lib/whatsapp/client';
import { waNotifyMeetingCancelled } from '@/lib/whatsapp/notifications';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Notify all members that a meeting was cancelled. Details (including the
// admin's reason) are passed in rather than looked up: the delete-meeting
// caller removes the row before calling this, so there'd be nothing left to
// read back; the cancel-meeting caller keeps the row but passes the same
// shape either way.
export async function POST(req: NextRequest) {
  try {
    const { meetingNumber, meetingDate, startTime, endTime, meetingTheme, reason } = await req.json() as {
      meetingNumber: number; meetingDate: string; startTime?: string; endTime?: string;
      meetingTheme?: string | null; reason?: string | null;
    };
    if (!meetingNumber || !meetingDate) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: members } = await supabase.from('members').select('id, name, display_name, email, active');
    const active = (members ?? []).filter((m) => m.active && m.email);

    const time = startTime && endTime ? `${formatTime(startTime)}–${formatTime(endTime)}` : '';
    const base = {
      club_name: CLUB_NAME,
      app_url: await getAppUrl(),
      meeting_number: String(meetingNumber),
      meeting_date: formatDate(meetingDate),
      meeting_time: time,
      meeting_theme: meetingTheme && meetingTheme !== 'TBD' ? meetingTheme : 'To be decided',
      cancellation_reason_block: cancellationReasonBlock(reason),
    };
    // Individual "Dear TM …" emails, one per member.
    let sent = 0;
    for (const m of active) {
      const res = await sendOne('meeting_cancelled', m.email as string, { ...base, full_name: m.name || m.display_name });
      if ('ok' in res) sent++;
    }

    const wa = await getWhatsAppSettings().catch(() => null);
    let waSent = 0;
    if (wa?.enabled && wa.meeting_cancelled_enabled) {
      const res = await waNotifyMeetingCancelled({
        meetingNumber, meetingDate, startTime, endTime, reason: reason ?? null,
      }).catch((err) => {
        console.error('[notify-meeting-cancelled] whatsapp failed', err);
        return null;
      });
      if (res && 'ok' in res) waSent = res.sent;
    }

    if (active.length === 0 && waSent === 0) return NextResponse.json({ skipped: 'no recipients' });
    return NextResponse.json({ ok: true, recipients: sent, whatsapp: waSent });
  } catch (err) {
    console.error('[notify-meeting-cancelled] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
