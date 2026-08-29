import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyMeetingCreated, type MeetingRow } from '@/lib/email/notifications';
import { getWhatsAppSettings } from '@/lib/whatsapp/client';
import { waNotifyMeetingCreated } from '@/lib/whatsapp/notifications';

// The meeting-created loop below sends one email + one WhatsApp message per
// active member, sequentially. The platform default hasn't reliably been long
// enough to cover that plus a slow/stalled SMTP or Graph API call, and a
// killed invocation leaves zero trace (see the timeout notes in
// lib/email/mailer.ts and lib/whatsapp/client.ts).
export const maxDuration = 60;

function nextWeekdayAfter(from: Date, weekday: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

// Format a Date as YYYY-MM-DD from its LOCAL components. `nextWeekdayAfter`
// matches the weekday in local time, so read the date back in local time too —
// `toISOString()` converts to UTC and, in a timezone ahead of UTC (e.g. IST),
// rolls the date back a day (Jul 29 → Jul 28).
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isMeetingPast(m: { date: string; end_time: string }): boolean {
  const [y, mo, d] = m.date.split('-').map(Number);
  const [h, min]   = m.end_time.split(':').map(Number);
  const istOffsetMin = 5 * 60 + 30;
  const utcMinutes   = h * 60 + min - istOffsetMin;
  const utcH  = Math.floor(((utcMinutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const utcM  = ((utcMinutes % 60) + 60) % 60;
  const utcDay = utcMinutes < 0 ? -1 : 0;
  return Date.now() >= new Date(Date.UTC(y, mo - 1, d + utcDay, utcH, utcM, 0)).getTime();
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const [{ data: cfg }, { data: allMeetings }] = await Promise.all([
    supabase.from('agenda_config').select('schedule_weekday, schedule_start_time, schedule_end_time, default_disabled_roles, auto_schedule_paused').single(),
    supabase.from('meetings').select('id, number, date, start_time, end_time').order('number', { ascending: false }),
  ]);

  if (!cfg) return NextResponse.json({ skipped: 'no schedule config' });
  if (cfg.auto_schedule_paused) return NextResponse.json({ skipped: 'auto-schedule paused' });
  if (!allMeetings) return NextResponse.json({ error: 'failed to load meetings' }, { status: 500 });

  const upcoming = allMeetings.filter(m => !isMeetingPast(m)).sort((a, b) => a.number - b.number);

  // We only ever create ONE upcoming meeting: the "next" meeting. It's created
  // only once the current one is over (i.e. when there are no upcoming meetings
  // left). Existing meetings are never deleted — any already-created future
  // meetings stay in the DB; the UI just shows the next meeting only.
  const needed = upcoming.length === 0 ? 1 : 0;

  if (needed <= 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'next meeting already exists' });
  }

  const weekday   = cfg.schedule_weekday ?? 6;
  const startTime = cfg.schedule_start_time ?? '19:30';
  const endTime   = cfg.schedule_end_time ?? '21:00';
  const disabledRoles: string[] = cfg.default_disabled_roles ?? [];
  // Mirror the admin form: a Speakathon = Table Topics off while speeches stay on.
  const meetingType = disabledRoles.includes('ttm') && !disabledRoles.includes('speaker') ? 'speakathon' : 'regular';
  const maxNumber = allMeetings.reduce((max, m) => Math.max(max, m.number), 0);
  // Advance from whichever is later: today, or the last meeting on record — so
  // the next meeting always lands on the next configured weekday AFTER the most
  // recent meeting and never reuses or precedes an existing meeting's date.
  const latestDateStr = allMeetings.reduce((max, m) => (m.date > max ? m.date : max), '');
  const latestDate = latestDateStr ? new Date(latestDateStr + 'T00:00:00') : new Date(0);
  const now = new Date();
  const startFrom = latestDate > now ? latestDate : now;

  const rows = [];
  let cur = new Date(startFrom);
  let num = maxNumber + 1;

  for (let i = 0; i < needed; i++) {
    cur = nextWeekdayAfter(cur, weekday);
    rows.push({
      number: num++,
      date: toLocalDateStr(cur),
      start_time: startTime + ':00',
      end_time: endTime + ':00',
      theme: 'TBD',
      meeting_type: meetingType,
      speaker_slots: 1,
      evaluator_slots: 1,
      base_speaker_slots: 1,
      disabled_roles: disabledRoles,
    });
  }

  const { data: inserted, error } = await supabase.from('meetings').insert(rows)
    .select('id, number, date, start_time, end_time, theme, meeting_link');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Announce each auto-created meeting to all members (best-effort). WhatsApp
  // rides alongside email here too, matching the manual "create meeting" path
  // in /api/notify-meeting-created — otherwise a club running WhatsApp only
  // gets announcements for meetings an admin created by hand.
  const wa = await getWhatsAppSettings().catch(() => null);
  for (const m of inserted ?? []) {
    try { await notifyMeetingCreated(m as MeetingRow); } catch (err) {
      console.error('[auto-schedule] meeting_created email failed', err);
    }
    if (wa?.enabled && wa.meeting_created_enabled) {
      try { await waNotifyMeetingCreated(m as MeetingRow, { dedupe: false }); } catch (err) {
        console.error('[auto-schedule] meeting_created whatsapp failed', err);
      }
    }
  }

  console.log(`[auto-schedule] Created ${rows.length} meetings: ${rows.map(r => r.date).join(', ')}`);
  return NextResponse.json({ ok: true, created: rows.length, meetings: rows.map(r => r.date) });
}
