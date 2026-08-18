import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import {
  notifyMeetingCreated, sendMeetingReminder, sendMeetingReminderDayBefore, sendRoleReminders,
  sendOpenRolesNudge, broadcastRoleAssigned, broadcastLeadershipAssigned, broadcastMentorAssigned,
  broadcastWelcome, pickUpcomingMeeting, type MeetingRow,
} from '@/lib/email/notifications';

// The meeting every "next meeting" email (broadcast or 1:1) is built from.
async function loadTargetMeeting(): Promise<MeetingRow | undefined> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('meetings').select('id, number, date, start_time, end_time, theme, meeting_link')
    .order('date', { ascending: true });
  return pickUpcomingMeeting((data ?? []) as MeetingRow[]);
}

// Lets the admin UI show which meeting a manual send will use *before* sending.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId') ?? '';
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ meeting: (await loadTargetMeeting()) ?? null });
}

// Templates that can be broadcast on demand. `meeting` ones need the next meeting.
const BROADCAST_KEYS = [
  'meeting_created', 'meeting_reminder', 'meeting_reminder_day_before', 'open_roles', 'role_reminder',
  'role_assigned', 'leadership_assigned', 'mentor_assigned', 'welcome',
] as const;
type BroadcastKey = typeof BROADCAST_KEYS[number];
const NEEDS_MEETING: BroadcastKey[] = ['meeting_created', 'meeting_reminder', 'meeting_reminder_day_before', 'open_roles', 'role_reminder', 'role_assigned'];

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

  let meeting: MeetingRow | undefined;
  if (NEEDS_MEETING.includes(key)) {
    meeting = await loadTargetMeeting();
    if (!meeting) return NextResponse.json({ error: 'No meeting to reference' }, { status: 400 });
    // The client shows the target meeting before sending; reject a stale confirm
    // (e.g. the meeting ended, or a new one was added, while the panel sat open).
    if (body.expectedMeetingId && body.expectedMeetingId !== meeting.id) {
      return NextResponse.json({
        error: `The next meeting changed to #${meeting.number} — nothing was sent. Check the details and send again.`,
        meeting,
      }, { status: 409 });
    }
  }

  let recipients = 0;
  const meetingNumber: number | undefined = meeting?.number;

  switch (key) {
    case 'meeting_created':
    case 'meeting_reminder':
    case 'meeting_reminder_day_before': {
      const result = key === 'meeting_created'
        ? await notifyMeetingCreated(meeting!)
        : key === 'meeting_reminder_day_before'
          ? await sendMeetingReminderDayBefore(meeting!, { dedupe: false })
          : await sendMeetingReminder(meeting!, { dedupe: false });
      if ('error' in result) return NextResponse.json(result, { status: 500 });
      // Report what actually went out — sends can be skipped per member (opt-out,
      // template disabled), so the member count would overstate it.
      if ('skipped' in result) {
        return NextResponse.json({ error: `Nothing sent — ${result.skipped}` }, { status: 400 });
      }
      if (result.sent === 0) {
        return NextResponse.json({ error: `Nothing sent — ${result.reason ?? 'no recipients'}` }, { status: 400 });
      }
      recipients = result.sent;
      break;
    }
    case 'open_roles': {
      const result = await sendOpenRolesNudge(meeting!, { dedupe: false });
      if ('skipped' in result) {
        return NextResponse.json({ error: `Nothing sent — ${result.skipped}` }, { status: 400 });
      }
      if (result.sent === 0) {
        return NextResponse.json({ error: `Nothing sent — ${result.reason ?? 'no recipients'}` }, { status: 400 });
      }
      recipients = result.sent;
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

  return NextResponse.json({ ok: true, meetingNumber, meeting: meeting ?? null, recipients });
}
