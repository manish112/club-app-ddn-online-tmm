// High-level, server-only WhatsApp notifications. Callers (the meeting-created
// route, the reminder cron, the admin panel) stay thin; these do the DB reads
// and build the template variables.
//
// A short list of messages, and deliberately so: WhatsApp lands on a phone, so
// anything not worth interrupting someone for belongs in the email instead.
// Every one of them signs off from the VP Education by name.
import { createServiceClient } from '@/utils/supabase/server';
import { ROLE_META, type RoleKey } from '@/lib/types';
import { openRoleSlots } from '@/lib/open-roles';
import { formatDate, formatTime } from '@/lib/email/format';
import { getAppUrl, getVpEducationName } from '@/lib/email/mailer';
import { pickUpcomingMeeting, type MeetingRow } from '@/lib/email/notifications';
import { deliverWhatsApp, getWhatsAppSettings, normalizePhone } from './client';
import type { WaTemplateKey } from './defaults';
import type { TemplateVars } from '@/lib/email/render';

const CLUB_NAME = 'Dehradun Online Toastmasters';

const MULTI_SLOT_ROLES = ['speaker', 'evaluator', 'jury'];

interface WaMemberLite {
  id: string;
  name: string;
  display_name: string;
  phone: string | null;
  active: boolean;
  whatsapp_notifications?: boolean;
}

const MEMBER_COLS = 'id, name, display_name, phone, active, whatsapp_notifications';

// Everyone who can and wants to be messaged. The opt-out column may be absent on
// a database that hasn't run migration 055, so treat undefined as opted in.
function reachable(members: WaMemberLite[] | null | undefined, countryCode: string): WaMemberLite[] {
  return (members ?? []).filter((m) =>
    m.active
    && m.whatsapp_notifications !== false
    && !!normalizePhone(m.phone, countryCode));
}

// Every message signs off from the VP Education by name, so every send needs it.
// Falls back to the office rather than the person when nobody holds it — a
// sign-off reading "Regards, -" is worse than one reading "Regards, VP Education".
async function signOffVars(): Promise<TemplateVars> {
  return {
    club_name: CLUB_NAME,
    vp_education_name: (await getVpEducationName()) || 'VP Education',
  };
}

async function baseVars(meeting: MeetingRow, appUrl: string): Promise<TemplateVars> {
  return {
    ...(await signOffVars()),
    app_url: appUrl,
    meeting_number: String(meeting.number),
    meeting_date: formatDate(meeting.date),
    meeting_time: `${formatTime(meeting.start_time)}–${formatTime(meeting.end_time)}`,
    // Just the start, for the messages that say "starts at …" — a range there
    // reads as nonsense ("starts at 7:30 PM–9:00 PM").
    meeting_start: formatTime(meeting.start_time),
    meeting_theme: meeting.theme && meeting.theme !== 'TBD' ? meeting.theme : 'To be decided',
    // Never empty: Meta rejects a blank body parameter, and pointing at the app
    // is more useful than a dash when no video link has been set.
    meeting_link: meeting.meeting_link?.trim() || appUrl,
  };
}

function roleLabel(roleKey: RoleKey, slotIndex: number): string {
  const meta = ROLE_META[roleKey];
  const label = meta?.label ?? roleKey;
  return label + (MULTI_SLOT_ROLES.includes(roleKey) ? ` ${slotIndex}` : '');
}

export interface WaRunResult {
  ok: true;
  sent: number;
  failed: number;
  /** Why nothing went out, when nothing did — the admin needs this, not silence. */
  reason: string | null;
}

function summarize(sent: number, failed: number, reasons: string[]): WaRunResult {
  return { ok: true, sent, failed, reason: sent === 0 ? reasons[0] ?? null : null };
}

// ── New meeting announced (to every reachable member) ───────────────────────
export async function waNotifyMeetingCreated(
  meeting: MeetingRow, opts?: { dedupe?: boolean },
): Promise<WaRunResult | { skipped: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select(MEMBER_COLS);
  const audience = reachable(members as WaMemberLite[], settings.default_country_code);
  if (audience.length === 0) return { skipped: 'no reachable members' };

  const vars = await baseVars(meeting, await getAppUrl());
  return runSend('meeting_created', audience, meeting, () => vars,
    opts?.dedupe === false ? null : (m) => `wa_meeting_created:${meeting.id}:${m.id}`);
}

// ── 1 day before: reminder to each role holder ──────────────────────────────
// One message per role: someone playing both Timer and Ah-Counter needs both
// reminders, and merging them into a list loses the "this is yours" directness.
export async function waSendRoleReminders(
  meeting: MeetingRow, opts?: { dedupe?: boolean },
): Promise<WaRunResult | { skipped: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const [{ data: members }, { data: claims }] = await Promise.all([
    supabase.from('members').select(MEMBER_COLS),
    supabase.from('role_claims')
      .select('role_key, slot_index, member_id').eq('meeting_id', meeting.id),
  ]);
  const byId = new Map((members ?? []).map((m) => [m.id, m as WaMemberLite]));
  const base = await baseVars(meeting, await getAppUrl());

  let sent = 0, failed = 0;
  const reasons: string[] = [];

  for (const c of claims ?? []) {
    if (!c.member_id) continue;   // an admin-filled guest slot has no member to message
    const m = byId.get(c.member_id);
    if (!m || reachable([m], settings.default_country_code).length === 0) continue;

    const res = await deliverWhatsApp({
      key: 'role_reminder',
      phone: m.phone as string,
      meetingId: meeting.id,
      vars: { ...base, full_name: m.name || m.display_name, role_label: roleLabel(c.role_key as RoleKey, c.slot_index) },
      dedupeKey: opts?.dedupe === false
        ? undefined
        : `wa_role_reminder:${meeting.id}:${c.member_id}:${c.role_key}:${c.slot_index}`,
    });
    if ('ok' in res) sent++;
    else { failed += 'error' in res ? 1 : 0; reasons.push('skipped' in res ? res.skipped : res.error); }
  }
  if (sent === 0 && reasons.length === 0) return { skipped: 'no role holders to message' };
  return summarize(sent, failed, reasons);
}

// ── 1 day before: nudge the members who haven't taken anything on ───────────
export async function waSendNoRoleNudge(
  meeting: MeetingRow, opts?: { dedupe?: boolean },
): Promise<WaRunResult | { skipped: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const [open, { data: members }] = await Promise.all([
    openRoleSlots(meeting.id),
    supabase.from('members').select(MEMBER_COLS),
  ]);
  // Every role is spoken for — asking someone to pick one would be nonsense.
  if (open.roles.length === 0) return { skipped: 'no open roles' };

  const audience = reachable(members as WaMemberLite[], settings.default_country_code)
    .filter((m) => !open.claimedBy.has(m.id));
  if (audience.length === 0) return { skipped: 'everyone already has a role' };

  // A single line, because Meta rejects a body parameter containing newlines.
  const list = open.roles.map(({ roleKey, slot }) => roleLabel(roleKey, slot)).join(LIST_SEP);
  const vars = {
    ...(await baseVars(meeting, await getAppUrl())),
    open_roles_count: String(open.roles.length),
    open_roles_list: list,
  };

  return runSend('no_role_nudge', audience, meeting, () => vars,
    opts?.dedupe === false ? null : (m) => `wa_no_role_nudge:${meeting.id}:${m.id}`);
}

// The role sheet, split into the two lines the meeting-day message prints under
// its "Roles taken" and "Still open" headings.
//
// Each is one line because Meta rejects a body parameter containing newlines;
// the headings and blank lines around them are fixed text in the template, where
// line breaks are allowed. Items are separated by " · " and a holder is joined
// to their role with ": " — read at a glance on a phone, and unambiguous even
// when a role label contains a space.
//
// Both come back non-empty: a blank parameter is rejected outright, and "nobody
// yet" is a more useful thing to read than a dash anyway.
const LIST_SEP = ' · ';

async function roleSheetLines(meetingId: string): Promise<{ taken: string; open: string }> {
  const supabase = createServiceClient();
  const [{ data: claims }, { data: members }, openSlots] = await Promise.all([
    supabase.from('role_claims')
      .select('role_key, slot_index, member_id, guest_name').eq('meeting_id', meetingId),
    supabase.from('members').select('id, display_name'),
    openRoleSlots(meetingId),
  ]);

  const nameById = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]));
  const taken = (claims ?? [])
    .filter((c) => ROLE_META[c.role_key as RoleKey])
    .map((c) => {
      const who = c.guest_name
        ? `${c.guest_name} (guest)`
        : `TM ${nameById.get(c.member_id as string) ?? '—'}`;
      return `${roleLabel(c.role_key as RoleKey, c.slot_index)}: ${who}`;
    });

  return {
    taken: taken.length ? taken.join(LIST_SEP) : 'Nobody yet — the agenda is wide open.',
    open: openSlots.roles.length
      ? openSlots.roles.map(({ roleKey, slot }) => roleLabel(roleKey, slot)).join(LIST_SEP)
      : 'None — every role is filled 🎉',
  };
}

// ── Meeting day: starting soon, with the full role sheet ────────────────────
export async function waSendMeetingStarting(
  meeting: MeetingRow, opts?: { dedupe?: boolean },
): Promise<WaRunResult | { skipped: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select(MEMBER_COLS);
  const audience = reachable(members as WaMemberLite[], settings.default_country_code);
  if (audience.length === 0) return { skipped: 'no reachable members' };

  const sheet = await roleSheetLines(meeting.id);
  const vars = {
    ...(await baseVars(meeting, await getAppUrl())),
    roles_taken: sheet.taken,
    roles_open: sheet.open,
  };
  return runSend('meeting_starting', audience, meeting, () => vars,
    opts?.dedupe === false ? null : (m) => `wa_meeting_starting:${meeting.id}:${m.id}`);
}

// ── Role assigned / removed (1:1, the moment it happens) ────────────────────
export async function waNotifyRoleChange(params: {
  target: { id: string; name: string; display_name: string; phone: string | null; active: boolean; whatsapp_notifications?: boolean };
  actor: { id: string; display_name: string } | null;
  actorIsAdmin: boolean;
  meeting: MeetingRow;
  roleKey: RoleKey;
  slotIndex?: number;
  action: 'claimed' | 'released' | 'assigned' | 'removed';
}): Promise<{ ok: true } | { skipped: string } | { error: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };
  if (!settings.role_change_enabled) return { skipped: 'role change messages off' };

  const { target, actor, actorIsAdmin, meeting, roleKey, action } = params;
  if (reachable([target], settings.default_country_code).length === 0) {
    return { skipped: 'member not reachable on whatsapp' };
  }

  const isAssign = action === 'claimed' || action === 'assigned';

  // Never blank: Meta rejects an empty body parameter, and "who did this" is the
  // part a member actually wonders about when a role appears or disappears.
  const actorLine = !actor || actor.id === target.id
    ? (isAssign ? 'You picked this up yourself.' : 'You released it yourself.')
    : `This was done by ${actorIsAdmin ? 'Admin ' : ''}TM ${actor.display_name}.`;

  const res = await deliverWhatsApp({
    key: isAssign ? 'role_assigned' : 'role_removed',
    phone: target.phone as string,
    meetingId: meeting.id,
    vars: {
      ...(await baseVars(meeting, await getAppUrl())),
      full_name: target.name || target.display_name,
      role_label: roleLabel(roleKey, params.slotIndex ?? 1),
      actor_line: actorLine,
    },
  });
  return 'ok' in res ? { ok: true } : res;
}

// ── Welcome / introducing the channel ───────────────────────────────────────
// Sent to a newly added member, and sendable to the whole club once so members
// who predate WhatsApp find out what is about to start arriving — and how to
// stop it — before the first reminder lands.
export async function waSendWelcome(
  memberId: string,
): Promise<{ ok: true } | { skipped: string } | { error: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };
  if (!settings.welcome_enabled) return { skipped: 'welcome message off' };

  const supabase = createServiceClient();
  const { data: member } = await supabase.from('members').select(MEMBER_COLS).eq('id', memberId).single();
  if (!member) return { skipped: 'member not found' };
  if (reachable([member as WaMemberLite], settings.default_country_code).length === 0) {
    return { skipped: 'member not reachable on whatsapp' };
  }

  const res = await deliverWhatsApp({
    key: 'welcome',
    phone: (member as WaMemberLite).phone as string,
    vars: {
      ...(await signOffVars()),
      app_url: await getAppUrl(),
      full_name: member.name || member.display_name,
    },
  });
  return 'ok' in res ? { ok: true } : res;
}

// The club-wide run. Not deduped — an admin asking for it again means they want
// it sent again, matching how the email broadcasts behave.
export async function waBroadcastWelcome(): Promise<WaRunResult | { skipped: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select(MEMBER_COLS);
  const audience = reachable(members as WaMemberLite[], settings.default_country_code);
  if (audience.length === 0) return { skipped: 'no reachable members' };

  const base = { ...(await signOffVars()), app_url: await getAppUrl() };
  let sent = 0, failed = 0;
  const reasons: string[] = [];
  for (const m of audience) {
    const res = await deliverWhatsApp({
      key: 'welcome',
      phone: m.phone as string,
      vars: { ...base, full_name: m.name || m.display_name },
    });
    if ('ok' in res) sent++;
    else { failed += 'error' in res ? 1 : 0; reasons.push('skipped' in res ? res.skipped : res.error); }
  }
  return summarize(sent, failed, reasons);
}

// Re-send "you have this role" to everyone currently holding one at a meeting.
// The manual counterpart to the per-claim message, for a club adopting WhatsApp
// mid-cycle whose members never got the original.
export async function waBroadcastRoleAssigned(
  meeting: MeetingRow,
): Promise<WaRunResult | { skipped: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const [{ data: members }, { data: claims }] = await Promise.all([
    supabase.from('members').select(MEMBER_COLS),
    supabase.from('role_claims')
      .select('role_key, slot_index, member_id').eq('meeting_id', meeting.id),
  ]);
  const byId = new Map((members ?? []).map((m) => [m.id, m as WaMemberLite]));
  const base = await baseVars(meeting, await getAppUrl());

  let sent = 0, failed = 0;
  const reasons: string[] = [];
  for (const c of claims ?? []) {
    if (!c.member_id) continue;
    const m = byId.get(c.member_id);
    if (!m || reachable([m], settings.default_country_code).length === 0) continue;
    const res = await deliverWhatsApp({
      key: 'role_assigned',
      phone: m.phone as string,
      meetingId: meeting.id,
      vars: {
        ...base,
        full_name: m.name || m.display_name,
        role_label: roleLabel(c.role_key as RoleKey, c.slot_index),
        actor_line: 'You are on the agenda for this meeting.',
      },
    });
    if ('ok' in res) sent++;
    else { failed += 'error' in res ? 1 : 0; reasons.push('skipped' in res ? res.skipped : res.error); }
  }
  if (sent === 0 && reasons.length === 0) return { skipped: 'no role holders to message' };
  return summarize(sent, failed, reasons);
}

// Shared loop for the three "one message per member" sends.
async function runSend(
  key: WaTemplateKey,
  audience: WaMemberLite[],
  meeting: MeetingRow,
  varsFor: (m: WaMemberLite) => TemplateVars,
  dedupeFor: ((m: WaMemberLite) => string) | null,
): Promise<WaRunResult> {
  let sent = 0, failed = 0;
  const reasons: string[] = [];
  for (const m of audience) {
    const res = await deliverWhatsApp({
      key,
      phone: m.phone as string,
      meetingId: meeting.id,
      vars: { ...varsFor(m), full_name: m.name || m.display_name },
      dedupeKey: dedupeFor ? dedupeFor(m) : undefined,
    });
    if ('ok' in res) sent++;
    else { failed += 'error' in res ? 1 : 0; reasons.push('skipped' in res ? res.skipped : res.error); }
  }
  return summarize(sent, failed, reasons);
}

// ── Preview vars built from REAL data ───────────────────────────────────────
// Same idea as the email preview: the next upcoming meeting and its actual open
// roles, so what an admin sees before sending is what members will read.
export async function buildWaPreviewVars(adminId?: string): Promise<TemplateVars> {
  const supabase = createServiceClient();
  const appUrl = await getAppUrl();
  const [{ data: meetings }, { data: admin }] = await Promise.all([
    supabase.from('meetings')
      .select('id, number, date, start_time, end_time, theme, meeting_link')
      .order('date', { ascending: true }),
    adminId
      ? supabase.from('members').select('name, display_name').eq('id', adminId).single()
      : Promise.resolve({ data: null }),
  ]);

  const fallbackName = admin?.name || admin?.display_name || '[Member name]';
  const meeting = pickUpcomingMeeting((meetings ?? []) as MeetingRow[]);

  if (!meeting) {
    return {
      ...(await signOffVars()),
      app_url: appUrl,
      meeting_number: '—', meeting_date: 'your next meeting',
      meeting_time: 'a time yet to be set', meeting_start: 'a time yet to be set',
      meeting_theme: 'To be decided', meeting_link: appUrl,
      full_name: fallbackName, role_label: 'Timer',
      actor_line: 'This was done by Admin TM [Admin name].',
      open_roles_count: '0', open_roles_list: 'none',
      roles_taken: 'No meeting scheduled, so there is no role sheet yet.',
      roles_open: 'No meeting scheduled, so there is no role sheet yet.',
    };
  }

  const [open, sheet] = await Promise.all([openRoleSlots(meeting.id), roleSheetLines(meeting.id)]);
  return {
    ...(await baseVars(meeting, appUrl)),
    full_name: fallbackName,
    role_label: 'Timer',
    actor_line: 'This was done by Admin TM [Admin name].',
    open_roles_count: String(open.roles.length),
    open_roles_list: open.roles.map(({ roleKey, slot }) => roleLabel(roleKey, slot)).join(LIST_SEP) || 'none',
    roles_taken: sheet.taken,
    roles_open: sheet.open,
  };
}
