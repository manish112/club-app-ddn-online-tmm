import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyMeetingCreated, type MeetingRow } from '@/lib/email/notifications';
import { getWhatsAppSettings } from '@/lib/whatsapp/client';
import { waNotifyMeetingCreated } from '@/lib/whatsapp/notifications';

export async function POST(req: NextRequest) {
  try {
    const { meetingId } = await req.json() as { meetingId: string };
    if (!meetingId) return NextResponse.json({ error: 'Missing meetingId' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: meeting } = await supabase.from('meetings')
      .select('id, number, date, start_time, end_time, theme, meeting_link')
      .eq('id', meetingId).single();
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    const result = await notifyMeetingCreated(meeting as MeetingRow);

    // WhatsApp goes out alongside the email, and independently of it: the two
    // channels are configured and toggled separately, so a club running one
    // without the other must still get that one. A WhatsApp failure never
    // fails the request — the email has already been sent by this point.
    let whatsapp: unknown = { skipped: 'whatsapp disabled' };
    try {
      const wa = await getWhatsAppSettings();
      if (wa?.enabled && wa.meeting_created_enabled) {
        whatsapp = await waNotifyMeetingCreated(meeting as MeetingRow, { dedupe: false });
      }
    } catch (err) {
      console.error('[notify-meeting-created] WhatsApp send failed:', err);
      whatsapp = { error: 'whatsapp send failed' };
    }

    if ('error' in result) return NextResponse.json({ ...result, whatsapp }, { status: 500 });
    // Echo the meeting back so the admin sees exactly which one was announced.
    return NextResponse.json({ ...result, whatsapp, meeting });
  } catch (err) {
    console.error('[notify-meeting-created] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
