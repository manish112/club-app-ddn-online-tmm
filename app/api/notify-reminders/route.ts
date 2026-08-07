import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { getEmailSettings } from '@/lib/email/mailer';
import { sendMeetingReminder, sendMeetingReminderDayBefore, sendRoleReminders, type MeetingRow } from '@/lib/email/notifications';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// The meeting's start instant, in UTC ms (date + start_time are IST wall-clock).
function meetingStartUtcMs(date: string, startTime: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = startTime.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
}

// YYYY-MM-DD for an IST-shifted instant (read via UTC getters).
function istDateStr(utcMs: number): string {
  const s = new Date(utcMs + IST_OFFSET_MS);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getEmailSettings();
  if (!settings || !settings.enabled) return NextResponse.json({ skipped: 'email disabled' });

  const supabase = createServiceClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, number, date, start_time, end_time, theme, meeting_link')
    .order('date', { ascending: true });

  const now = Date.now();
  const tomorrowIst = istDateStr(now + 24 * 60 * 60 * 1000);

  const actions: Record<string, string> = {};

  for (const m of (meetings ?? []) as MeetingRow[]) {
    const startMs = meetingStartUtcMs(m.date, m.start_time);

    // "Starting soon" → reminder to all members (fires within a 70-min window,
    // so the real lead time depends on when the cron lands; dedupe on the
    // meeting id keeps it to one send).
    if (settings.hour_before_enabled && now >= startMs - 70 * 60 * 1000 && now < startMs) {
      const res = await sendMeetingReminder(m);
      actions[`meeting_reminder:${m.number}`] = 'ok' in res ? `sent ${res.sent}` : res.skipped;
    }

    // 1 day before → per-role reminders to each role holder (deduped per member).
    if (settings.day_before_enabled && m.date === tomorrowIst) {
      const res = await sendRoleReminders(m);
      actions[`role_reminders:${m.number}`] = `sent ${res.sent}`;
    }

    // 1 day before → mass meeting reminder to all members (deduped on the meeting).
    if (settings.day_before_meeting_enabled && m.date === tomorrowIst) {
      const res = await sendMeetingReminderDayBefore(m);
      actions[`meeting_reminder_day:${m.number}`] = 'ok' in res ? `sent ${res.sent}` : res.skipped;
    }
  }

  return NextResponse.json({ ok: true, actions });
}
