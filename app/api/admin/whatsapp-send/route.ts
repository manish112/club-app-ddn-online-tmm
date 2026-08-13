import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';
import { pickUpcomingMeeting, type MeetingRow } from '@/lib/email/notifications';
import { openRoleSlots } from '@/lib/open-roles';
import { getWhatsAppSettings, normalizePhone } from '@/lib/whatsapp/client';
import { WA_MANUAL_SEND_KEYS, WA_MEETINGLESS_KEYS, type WaTemplateKey } from '@/lib/whatsapp/defaults';
import {
  waBroadcastRoleAssigned, waBroadcastWelcome, waNotifyMeetingCreated,
  waSendMeetingStarting, waSendNoRoleNudge, waSendRoleReminders,
} from '@/lib/whatsapp/notifications';

async function upcomingMeeting(): Promise<MeetingRow | undefined> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('meetings')
    .select('id, number, date, start_time, end_time, theme, meeting_link')
    .order('date', { ascending: true });
  return pickUpcomingMeeting((data ?? []) as MeetingRow[]);
}

// GET: which meeting a manual send would use, and how many members it would
// actually reach — shown *before* the admin commits, so a missing phone number
// or a database of members nobody can message is caught here rather than after.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getWhatsAppSettings();
  const cc = settings?.default_country_code ?? '91';

  const supabase = createServiceClient();
  const { data: members, error: membersError } = await supabase
    .from('members').select('id, active, phone, whatsapp_enabled, whatsapp_notifications');

  // A read that fails here means the per-member permission column is missing, and
  // every send is about to skip every member. Left unsaid, that shows up as
  // "0 of 0 members reachable" — which reads like an empty club rather than an
  // unapplied migration.
  const warning = membersError
    ? `Could not read the members table (${membersError.message}). `
      + 'Apply migration 058_whatsapp_per_member_enable.sql — until then no WhatsApp can be sent.'
    : null;

  // The same three reasons a member is unreachable, counted separately, because
  // they call for three different fixes: switch WhatsApp on for them, respect
  // their opt-out, or correct the phone number.
  const activeMembers = (members ?? []).filter((m) => m.active);
  const notEnabled = activeMembers.filter((m) => m.whatsapp_enabled !== true).length;
  const enabled = activeMembers.filter((m) => m.whatsapp_enabled === true);
  const reachable = enabled.filter(
    (m) => m.whatsapp_notifications !== false && !!normalizePhone(m.phone, cc));
  const optedOut = enabled.filter((m) => m.whatsapp_notifications === false).length;

  const meeting = await upcomingMeeting();
  const open = meeting ? await openRoleSlots(meeting.id) : null;

  return NextResponse.json({
    meeting: meeting ?? null,
    warning,
    audience: {
      active: activeMembers.length,
      reachable: reachable.length,
      noPhone: enabled.length - optedOut - reachable.length,
      optedOut,
      notEnabled,
    },
    openRoles: open ? open.roles.length : 0,
    withRole: open ? open.claimedBy.size : 0,
  });
}

// POST: fire one of the four notifications now, for the upcoming meeting.
// Deliberately not deduped — an admin asking for it a second time means they
// want it sent a second time, which is exactly how the email panel behaves.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = body.key as WaTemplateKey;
  if (!WA_MANUAL_SEND_KEYS.includes(key)) {
    return NextResponse.json({ error: 'That message cannot be sent by hand' }, { status: 400 });
  }

  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) {
    return NextResponse.json({ error: 'WhatsApp notifications are turned off' }, { status: 400 });
  }

  // The welcome isn't about any particular meeting, so it can go out when none
  // is scheduled — which is exactly when a club would introduce the channel.
  if (WA_MEETINGLESS_KEYS.includes(key)) {
    const result = await waBroadcastWelcome() as Record<string, unknown>;
    return NextResponse.json(result);
  }

  const meeting = await upcomingMeeting();
  if (!meeting) return NextResponse.json({ error: 'No meeting scheduled' }, { status: 400 });

  const senders: Partial<Record<WaTemplateKey, () => Promise<unknown>>> = {
    meeting_created:  () => waNotifyMeetingCreated(meeting, { dedupe: false }),
    // The manual counterpart to the per-claim message: everyone currently on the
    // agenda is told what they're down for.
    role_assigned:    () => waBroadcastRoleAssigned(meeting),
    role_reminder:    () => waSendRoleReminders(meeting, { dedupe: false }),
    no_role_nudge:    () => waSendNoRoleNudge(meeting, { dedupe: false }),
    meeting_starting: () => waSendMeetingStarting(meeting, { dedupe: false }),
  };

  const send = senders[key];
  if (!send) return NextResponse.json({ error: 'That message cannot be sent by hand' }, { status: 400 });

  const result = await send() as Record<string, unknown>;
  // Echo the meeting back so the admin sees exactly which one went out.
  return NextResponse.json({ ...result, meeting });
}
