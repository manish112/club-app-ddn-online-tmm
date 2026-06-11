import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';

function nextWeekdayAfter(from: Date, weekday: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
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
    supabase.from('agenda_config').select('schedule_weekday, schedule_start_time, schedule_end_time').single(),
    supabase.from('meetings').select('id, number, date, start_time, end_time').order('number', { ascending: false }),
  ]);

  if (!cfg) return NextResponse.json({ skipped: 'no schedule config' });
  if (!allMeetings) return NextResponse.json({ error: 'failed to load meetings' }, { status: 500 });

  const upcoming = allMeetings.filter(m => !isMeetingPast(m)).sort((a, b) => a.number - b.number);
  const needed   = 3 - upcoming.length;

  if (needed <= 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'already have 3+ upcoming meetings' });
  }

  const weekday   = cfg.schedule_weekday ?? 3;
  const startTime = cfg.schedule_start_time ?? '19:30';
  const endTime   = cfg.schedule_end_time ?? '21:00';
  const maxNumber = allMeetings.reduce((max, m) => Math.max(max, m.number), 0);
  const startFrom = upcoming.length > 0
    ? new Date(upcoming[upcoming.length - 1].date + 'T00:00:00')
    : new Date();

  const rows = [];
  let cur = new Date(startFrom);
  let num = maxNumber + 1;

  for (let i = 0; i < needed; i++) {
    cur = nextWeekdayAfter(cur, weekday);
    rows.push({
      number: num++,
      date: cur.toISOString().split('T')[0],
      start_time: startTime + ':00',
      end_time: endTime + ':00',
      theme: 'TBD',
      meeting_type: 'regular',
      speaker_slots: 1,
      evaluator_slots: 1,
    });
  }

  const { error } = await supabase.from('meetings').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[auto-schedule] Created ${rows.length} meetings: ${rows.map(r => r.date).join(', ')}`);
  return NextResponse.json({ ok: true, created: rows.length, meetings: rows.map(r => r.date) });
}
