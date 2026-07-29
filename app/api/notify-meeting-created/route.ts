import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyMeetingCreated, type MeetingRow } from '@/lib/email/notifications';

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
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    // Echo the meeting back so the admin sees exactly which one was emailed.
    return NextResponse.json({ ...result, meeting });
  } catch (err) {
    console.error('[notify-meeting-created] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
