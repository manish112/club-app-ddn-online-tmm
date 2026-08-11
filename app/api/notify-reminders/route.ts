import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { getEmailSettings } from '@/lib/email/mailer';
import { sendMeetingReminder, sendMeetingReminderDayBefore, sendOpenRolesNudge, sendRoleReminders, type MeetingRow } from '@/lib/email/notifications';
import { getWhatsAppSettings } from '@/lib/whatsapp/client';
import { waSendMeetingStarting, waSendNoRoleNudge, waSendRoleReminders } from '@/lib/whatsapp/notifications';

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

// Shift a YYYY-MM-DD calendar date by whole days. Pure date arithmetic — no
// timezone involved, since both sides are already IST wall-clock dates.
function shiftDate(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const s = new Date(Date.UTC(y, mo - 1, d + days));
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}

// One line per WhatsApp action in the cron's response — how many landed, or why
// none did. A run that reports "sent 0" and nothing else is unreadable.
function describe(res: { ok: true; sent: number; failed: number; reason: string | null } | { skipped: string }): string {
  if ('skipped' in res) return res.skipped;
  const failed = res.failed ? `, ${res.failed} failed` : '';
  return res.sent === 0 && res.reason ? `sent 0 (${res.reason})` : `sent ${res.sent}${failed}`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Both channels ride this one cron — Vercel's cron allowance is small, and
  // email and WhatsApp want the same "is it tomorrow / is it about to start"
  // arithmetic. Each is gated on its own settings, so either can run alone.
  const [settings, waSettings] = await Promise.all([getEmailSettings(), getWhatsAppSettings()]);
  const emailOn = !!settings?.enabled;
  const waOn = !!waSettings?.enabled;
  if (!emailOn && !waOn) return NextResponse.json({ skipped: 'email and whatsapp both disabled' });

  const supabase = createServiceClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, number, date, start_time, end_time, theme, meeting_link')
    .order('date', { ascending: true });

  const now = Date.now();
  const tomorrowIst = istDateStr(now + 24 * 60 * 60 * 1000);
  const todayIst = istDateStr(now);

  const actions: Record<string, string> = {};

  // Configurable lead times for the open-roles invitation (default 2 days —
  // Thursday for a Saturday meeting). More than one means it goes out more than
  // once, each time to whoever is still without a role.
  // Read defensively: this column was a single integer before it became a list,
  // so a database still on the older shape must not crash the whole cron.
  const rawDays: unknown = settings?.open_roles_days_before;
  const openRolesDays = (Array.isArray(rawDays) ? rawDays : rawDays == null ? [2] : [rawDays])
    .map(Number)
    .filter((d) => Number.isInteger(d));

  for (const m of (meetings ?? []) as MeetingRow[]) {
    const startMs = meetingStartUtcMs(m.date, m.start_time);

    // Open-roles invitation, N days before this meeting's own date — so moving
    // a meeting moves its invitation too. Goes only to members without a role
    // yet, and sends nothing when every role is taken.
    if (emailOn && settings!.open_roles_enabled) {
      // The lead day is part of the dedupe key: two configured days are two
      // distinct sends, and without it the second would be suppressed as a
      // duplicate of the first.
      const dueDay = openRolesDays.find((d) => shiftDate(m.date, -d) === todayIst);
      if (dueDay !== undefined) {
        const res = await sendOpenRolesNudge(m, { leadDay: dueDay });
        actions[`open_roles:${m.number}:d${dueDay}`] = 'ok' in res ? `sent ${res.sent}` : res.skipped;
      }
    }

    // "Starting soon" → reminder to all members (fires within a 70-min window,
    // so the real lead time depends on when the cron lands; dedupe on the
    // meeting id keeps it to one send).
    if (emailOn && settings!.hour_before_enabled && now >= startMs - 70 * 60 * 1000 && now < startMs) {
      const res = await sendMeetingReminder(m);
      actions[`meeting_reminder:${m.number}`] = 'ok' in res ? `sent ${res.sent}` : res.skipped;
    }

    // 1 day before → per-role reminders to each role holder (deduped per member).
    if (emailOn && settings!.day_before_enabled && m.date === tomorrowIst) {
      const res = await sendRoleReminders(m);
      actions[`role_reminders:${m.number}`] = `sent ${res.sent}`;
    }

    // 1 day before → mass meeting reminder to all members (deduped on the meeting).
    if (emailOn && settings!.day_before_meeting_enabled && m.date === tomorrowIst) {
      const res = await sendMeetingReminderDayBefore(m);
      actions[`meeting_reminder_day:${m.number}`] = 'ok' in res ? `sent ${res.sent}` : res.skipped;
    }

    // ── WhatsApp ────────────────────────────────────────────────────────────
    // Same triggers, its own toggles and its own dedupe keys, so turning one
    // channel on or off never moves the other.
    if (waOn) {
      const wa = waSettings!;

      // 1 day before → the role you agreed to play, to each role holder.
      if (wa.role_reminder_enabled && m.date === tomorrowIst) {
        const res = await waSendRoleReminders(m);
        actions[`wa_role_reminder:${m.number}`] = describe(res);
      }

      // 1 day before → "you haven't picked a role yet", to everyone who hasn't.
      // Sends nothing when the agenda is already full.
      if (wa.no_role_nudge_enabled && m.date === tomorrowIst) {
        const res = await waSendNoRoleNudge(m);
        actions[`wa_no_role_nudge:${m.number}`] = describe(res);
      }

      // Meeting day → "starting soon", within the configured lead window. The
      // real lead time depends on when the cron lands inside that window.
      const leadMs = (wa.meeting_starting_lead_minutes || 70) * 60 * 1000;
      if (wa.meeting_starting_enabled && now >= startMs - leadMs && now < startMs) {
        const res = await waSendMeetingStarting(m);
        actions[`wa_meeting_starting:${m.number}`] = describe(res);
      }
    }
  }

  return NextResponse.json({ ok: true, actions });
}
