import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import {
  notifyMeetingCreated, sendMeetingReminder, sendRoleReminders,
  broadcastRoleAssigned, broadcastLeadershipAssigned, broadcastMentorAssigned, broadcastWelcome,
  type MeetingRow,
} from '@/lib/email/notifications';

// Templates that can be broadcast on demand. `meeting` ones need the next meeting.
const BROADCAST_KEYS = [
  'meeting_created', 'meeting_reminder', 'role_reminder', 'role_assigned',
  'leadership_assigned', 'mentor_assigned', 'welcome',
] as const;
type BroadcastKey = typeof BROADCAST_KEYS[number];
const NEEDS_MEETING: BroadcastKey[] = ['meeting_created', 'meeting_reminder', 'role_reminder', 'role_assigned'];

// Manually (re)send a broadcast email. Recipients are computed from the type
// (and the next meeting, where relevant).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = body.templateKey as BroadcastKey;
  if (!BROADCAST_KEYS.includes(key)) {
    return NextResponse.json({ error: 'This template cannot be broadcast' }, { status: 400 });
  }

  const supabase = createServiceClient();

  let meeting: MeetingRow | undefined;
  if (NEEDS_MEETING.includes(key)) {
    const { data: meetings } = await supabase
      .from('meetings').select('id, number, date, start_time, end_time, theme, meeting_link')
      .order('date', { ascending: true });
    const list = (meetings ?? []) as MeetingRow[];
    const today = new Date().toISOString().slice(0, 10);
    meeting = list.find((m) => m.date >= today) ?? list[list.length - 1];
    if (!meeting) return NextResponse.json({ error: 'No meeting to reference' }, { status: 400 });
  }

  let recipients = 0;
  let meetingNumber: number | undefined = meeting?.number;

  switch (key) {
    case 'meeting_created':
    case 'meeting_reminder': {
      const { data: members } = await supabase.from('members').select('email, active');
      recipients = (members ?? []).filter((m) => m.active && m.email).length;
      const result = key === 'meeting_created'
        ? await notifyMeetingCreated(meeting!)
        : await sendMeetingReminder(meeting!, { dedupe: false });
      if ('error' in result) return NextResponse.json(result, { status: 500 });
      break;
    }
    case 'role_reminder':
      recipients = (await sendRoleReminders(meeting!, { dedupe: false })).sent;
      break;
    case 'role_assigned':
      recipients = (await broadcastRoleAssigned(meeting!)).sent;
      break;
    case 'leadership_assigned':
      recipients = (await broadcastLeadershipAssigned()).sent;
      break;
    case 'mentor_assigned':
      recipients = (await broadcastMentorAssigned()).sent;
      break;
    case 'welcome':
      recipients = (await broadcastWelcome()).sent;
      break;
  }

  return NextResponse.json({ ok: true, meetingNumber, recipients });
}
