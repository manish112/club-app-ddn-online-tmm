// High-level, server-only notification helpers. Callers (API routes + the
// reminder cron) stay thin; these do the DB reads and build template vars.
import { createServiceClient } from '@/utils/supabase/server';
import { ROLE_META, ASSIGN_ONLY_ROLES, getMeetingRoles, leadershipRoleLabel, type Meeting, type RoleKey, type LeadershipRole } from '@/lib/types';
import { formatDate, formatTime, escapeHtml, bioBlock } from './format';
import { sendOne, sendOneDeduped, getAppUrl, getEmailSettings, getVpEducationName } from './mailer';
import { buildMeetingIcs } from './ical';
import type { TemplateVars } from './render';

const CLUB_NAME = 'Dehradun Online Toastmasters';

export interface MeetingRow {
  id: string;
  number: number;
  date: string;
  start_time: string;
  end_time: string;
  theme: string | null;
  meeting_link?: string | null;
}

const KICKER = 'margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// A meeting's end instant in UTC ms (date + end_time are IST wall-clock).
function meetingEndUtcMs(m: MeetingRow): number {
  const [y, mo, d] = m.date.split('-').map(Number);
  const [h, mi] = (m.end_time || '23:59').split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
}

// The meeting that "next meeting" emails reference: the earliest one that hasn't
// finished yet in IST, else (nothing upcoming) the most recent past meeting.
// Comparing end instants — not a UTC date string — matters twice: a meeting stays
// selected until it actually ends, and it then rolls to the following one instead
// of lingering all day; and it can't drift a day because the server clock is UTC.
export function pickUpcomingMeeting<T extends MeetingRow>(list: T[]): T | undefined {
  const now = Date.now();
  const sorted = [...list].sort((a, b) => meetingEndUtcMs(a) - meetingEndUtcMs(b));
  return sorted.find((m) => meetingEndUtcMs(m) > now) ?? sorted[sorted.length - 1];
}

function meetingLinkBlock(link: string | null | undefined): string {
  if (!link) return '';
  const safe = escapeHtml(link);
  return `<p style="${KICKER}">Meeting Link</p>
    <a href="${safe}" style="display:inline-block;color:#0E2D6A;font-weight:700;font-size:14px;word-break:break-all;">🔗 Join the meeting</a>`;
}

function baseMeetingVars(meeting: MeetingRow, appUrl: string): Record<string, string> {
  return {
    club_name: CLUB_NAME,
    app_url: appUrl,
    meeting_number: String(meeting.number),
    meeting_date: formatDate(meeting.date),
    meeting_time: `${formatTime(meeting.start_time)}–${formatTime(meeting.end_time)}`,
    meeting_theme: meeting.theme && meeting.theme !== 'TBD' ? meeting.theme : 'To be decided',
    meeting_link_block: meetingLinkBlock(meeting.meeting_link),
  };
}

// member_id is null when an admin filled the slot with a named guest, in which
// case guest_name carries the holder (migration 053).
interface ClaimLite { role_key: RoleKey; slot_index: number; member_id: string | null; guest_name?: string | null }
interface MemberLite { id: string; name: string; display_name: string; email: string | null; active: boolean }

const MULTI_SLOT_ROLES = ['speaker', 'evaluator', 'jury'];

function slotLabel(roleKey: RoleKey, slotIndex: number): string {
  const meta = ROLE_META[roleKey];
  return meta.label + (MULTI_SLOT_ROLES.includes(roleKey) ? ` ${slotIndex}` : '');
}

function summaryRow(emoji: string, label: string, right: string, open: boolean): string {
  return `<tr><td style="padding:5px 0;color:#64748b;font-size:13px;">${emoji} ${label}</td>
    <td style="padding:5px 0;font-size:13px;font-weight:600;text-align:right;color:${open ? '#94a3b8' : '#1e293b'};">${right}</td></tr>`;
}

// The meeting's whole role sheet: who's taken what, and what's still going
// begging. `allRoles` is the meeting's full slot list — without it the summary
// can only show what's filled, which is how it used to read.
function rolesSummaryHtml(
  claims: ClaimLite[],
  byId: Map<string, MemberLite>,
  allRoles?: { roleKey: RoleKey; slot: number }[],
): string {
  const holderOf = new Map(claims.map((c) => [`${c.role_key}:${c.slot_index}`, c]));

  const nameFor = (c: ClaimLite): string => {
    if (c.guest_name) return `${escapeHtml(c.guest_name)} (Guest)`;
    const m = c.member_id ? byId.get(c.member_id) : undefined;
    return m ? `TM ${escapeHtml(m.display_name)}` : '—';
  };

  // Without the meeting's slot list, fall back to the old filled-only listing.
  if (!allRoles) {
    const rows = claims
      .filter((c) => ROLE_META[c.role_key])
      .map((c) => summaryRow(ROLE_META[c.role_key].emoji, slotLabel(c.role_key, c.slot_index), nameFor(c), false))
      .join('');
    if (!rows) return '';
    return `<p style="${KICKER}">Roles filled so far</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #f1f5f9;">${rows}</table>`;
  }

  const filled: string[] = [];
  const open: string[] = [];
  for (const { roleKey, slot } of allRoles) {
    const meta = ROLE_META[roleKey];
    if (!meta) continue;
    const claim = holderOf.get(`${roleKey}:${slot}`);
    const row = claim
      ? summaryRow(meta.emoji, slotLabel(roleKey, slot), nameFor(claim), false)
      : summaryRow(meta.emoji, slotLabel(roleKey, slot), 'Open', true);
    (claim ? filled : open).push(row);
  }
  if (filled.length === 0 && open.length === 0) return '';

  const table = (rows: string[]) =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #f1f5f9;">${rows.join('')}</table>`;

  let html = '';
  if (filled.length) html += `<p style="${KICKER}">Roles filled so far</p>${table(filled)}`;
  if (open.length) {
    html += `<p style="${KICKER}">Still open — yours if you&apos;d like one</p>${table(open)}`;
  }
  return html;
}

// ── Role assigned / removed (1:1) ───────────────────────────────────────────
export async function notifyRoleChange(params: {
  target: MemberLite;
  actor: { id: string; display_name: string } | null;
  actorIsAdmin: boolean;
  meeting: MeetingRow;
  roleKey: RoleKey;
  action: 'claimed' | 'released' | 'assigned' | 'removed';
}) {
  const { target, actor, actorIsAdmin, meeting, roleKey, action } = params;
  if (!target.email) return { skipped: 'no email' };

  const meta = ROLE_META[roleKey];
  const isAssign = action === 'claimed' || action === 'assigned';

  let actorLine = '';
  if (actor && actor.id !== target.id) {
    actorLine = ` This was done by ${actorIsAdmin ? 'Admin ' : ''}TM ${escapeHtml(actor.display_name)}.`;
  }

  const vars = {
    ...baseMeetingVars(meeting, await getAppUrl()),
    full_name: target.name || target.display_name,
    role_label: meta?.label ?? roleKey,
    role_emoji: meta?.emoji ?? '',
    actor_line: actorLine,
  };

  return sendOne(isAssign ? 'role_assigned' : 'role_removed', target.email, vars, meeting.id);
}

// ── New meeting announced (mass, BCC) ───────────────────────────────────────
export async function notifyMeetingCreated(meeting: MeetingRow) {
  return sendMeetingIndividual(meeting, 'meeting_created', null);
}

// Send a meeting email individually to each active member, greeting them by name
// ("Dear TM …"). `dedupeKind` set → each member's send is idempotent (used by the
// once-only reminder crons); null → always send (creation / manual broadcast).
async function sendMeetingIndividual(
  meeting: MeetingRow,
  templateKey: 'meeting_created' | 'meeting_reminder' | 'meeting_reminder_day_before',
  dedupeKind: string | null,
  attachIcs = false,
) {
  const supabase = createServiceClient();
  // The slot config comes along so the summary can show what's still open, not
  // just what's taken.
  const [{ data: members }, { data: claims }, { data: full }] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, active'),
    supabase.from('role_claims').select('role_key, slot_index, member_id, guest_name').eq('meeting_id', meeting.id),
    supabase.from('meetings')
      .select('id, speaker_slots, evaluator_slots, jury_slots, disabled_roles, meeting_type')
      .eq('id', meeting.id).single(),
  ]);
  const active = (members ?? []).filter((m) => m.active && m.email);
  if (active.length === 0) return { skipped: 'no recipients' as const };

  const byId = new Map((members ?? []).map((m) => [m.id, m as MemberLite]));
  const appUrl = await getAppUrl();
  const allRoles = full ? getMeetingRoles(full as unknown as Meeting) : undefined;
  const rolesSummary = rolesSummaryHtml((claims ?? []) as ClaimLite[], byId, allRoles);

  // Organizer for the calendar invite = the configured "from" identity.
  const settings = attachIcs ? await getEmailSettings() : null;
  const organizer = { name: settings?.from_name || CLUB_NAME, email: settings?.from_email || '' };

  let sent = 0;
  // Why nothing went out matters to the admin (email disabled, template off,
  // everyone opted out…) — deliver() only reports it per-recipient, so keep one.
  const reasons: string[] = [];
  for (const m of active) {
    const vars = {
      ...baseMeetingVars(meeting, appUrl),
      roles_summary: rolesSummary,
      full_name: m.name || m.display_name,
    };
    const icalEvent = attachIcs && organizer.email
      ? { method: 'REQUEST', filename: 'invite.ics', content: buildMeetingIcs(meeting, { name: m.display_name, email: m.email as string }, organizer) }
      : undefined;
    const res = dedupeKind
      ? await sendOneDeduped(templateKey, m.email as string, vars, { dedupeKey: `${dedupeKind}:${meeting.id}:${m.id}`, meetingId: meeting.id, icalEvent })
      : await sendOne(templateKey, m.email as string, vars, meeting.id, icalEvent);
    if ('ok' in res) sent++;
    else reasons.push('skipped' in res ? res.skipped : res.error);
  }
  return { ok: true as const, sent, reason: sent === 0 ? reasons[0] ?? null : null };
}

// ── "starting soon" meeting reminder ────────────────────────────────────────
// Fires on the last cron run before the meeting, so the actual lead time varies
// (~1 hour down to a few minutes) — the copy stays time-agnostic.
// Individual "Dear TM …" emails, deduped per member.
export function sendMeetingReminder(meeting: MeetingRow, opts?: { dedupe?: boolean }) {
  return sendMeetingIndividual(meeting, 'meeting_reminder', opts?.dedupe === false ? null : 'meeting_reminder');
}

// 1-day-before reminder (individual "Dear TM …" emails, deduped per member),
// with a calendar invite (.ics) attached so members can add it to their calendar.
export function sendMeetingReminderDayBefore(meeting: MeetingRow, opts?: { dedupe?: boolean }) {
  return sendMeetingIndividual(meeting, 'meeting_reminder_day_before', opts?.dedupe === false ? null : 'meeting_reminder_day_before', true);
}

// ── Open-roles invitation (weekly, mass, deduped per member) ────────────────

// The roles nobody has taken for a meeting, and that a member could actually
// act on, as ready-to-drop-in HTML. Shared by the mail itself and the admin
// preview so what an admin sees on screen is what members receive.
async function openRolesFor(meetingId: string): Promise<{
  count: number;
  listHtml: string;
  /** Members already holding a role at this meeting — they don't need inviting. */
  claimedBy: Set<string>;
}> {
  const supabase = createServiceClient();
  // getMeetingRoles needs the slot counts and disabled categories, which the
  // lighter MeetingRow used elsewhere doesn't carry.
  const [{ data: full }, { data: claims }] = await Promise.all([
    supabase.from('meetings')
      .select('id, speaker_slots, evaluator_slots, jury_slots, disabled_roles, meeting_type')
      .eq('id', meetingId).single(),
    supabase.from('role_claims').select('role_key, slot_index, member_id').eq('meeting_id', meetingId),
  ]);
  const claimedBy = new Set(
    (claims ?? []).map((c) => c.member_id).filter((id): id is string => !!id));
  if (!full) return { count: 0, listHtml: '', claimedBy };

  const taken = new Set((claims ?? []).map((c) => `${c.role_key}:${c.slot_index}`));

  const openRoles = getMeetingRoles(full as unknown as Meeting).filter(({ roleKey, slot }) => {
    if (taken.has(`${roleKey}:${slot}`)) return false;
    // An admin assigns these, so a member can't act on the invitation.
    if (ASSIGN_ONLY_ROLES.includes(roleKey)) return false;
    // The app holds an evaluator slot closed until its speaker claims and names
    // a preference — offering one now would be a dead end.
    if (roleKey === 'evaluator' && !taken.has(`speaker:${slot}`)) return false;
    return true;
  });
  if (openRoles.length === 0) return { count: 0, listHtml: '', claimedBy };

  // Multi-slot roles are numbered so "Prepared Speaker 2" reads unambiguously.
  const multiSlot = new Set(['speaker', 'evaluator']);
  const rows = openRoles.map(({ roleKey, slot }) => {
    const meta = ROLE_META[roleKey];
    const label = meta.label + (multiSlot.has(roleKey) ? ` ${slot}` : '');
    return `<tr><td style="padding:7px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:14px;font-weight:600;">${meta.emoji} ${escapeHtml(label)}</td></tr>`;
  }).join('');

  return {
    count: openRoles.length,
    listHtml: `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #f1f5f9;">${rows}</table>`,
    claimedBy,
  };
}

export async function sendOpenRolesNudge(
  meeting: MeetingRow,
  opts?: { dedupe?: boolean; leadDay?: number },
) {
  const supabase = createServiceClient();
  const [open, { data: members }] = await Promise.all([
    openRolesFor(meeting.id),
    supabase.from('members').select('id, name, display_name, email, active'),
  ]);
  // Every role is spoken for — say nothing rather than send an empty list.
  if (open.count === 0) return { skipped: 'no open roles' as const };

  // Only members who haven't taken anything at this meeting. Someone already on
  // the agenda doesn't need inviting, and telling them what's still open is
  // noise — the reminder about their own role is a separate email.
  const active = (members ?? []).filter((m) => m.active && m.email && !open.claimedBy.has(m.id as string));
  if (active.length === 0) return { skipped: 'everyone already has a role' as const };

  const appUrl = await getAppUrl();
  let sent = 0;
  const reasons: string[] = [];
  for (const m of active) {
    const vars = {
      ...baseMeetingVars(meeting, appUrl),
      full_name: m.name || m.display_name,
      open_roles_list: open.listHtml,
      open_roles_count: String(open.count),
    };
    // Deduped per member per scheduled send, so a cron that runs twice in a day
    // can't double up — while two configured lead days remain two real sends.
    const res = opts?.dedupe === false
      ? await sendOne('open_roles', m.email as string, vars, meeting.id)
      : await sendOneDeduped('open_roles', m.email as string, vars, {
          dedupeKey: `open_roles:${meeting.id}:d${opts?.leadDay ?? 0}:${m.id}`, meetingId: meeting.id });
    if ('ok' in res) sent++;
    else reasons.push('skipped' in res ? res.skipped : res.error);
  }
  return { ok: true as const, sent, openCount: open.count, reason: sent === 0 ? reasons[0] ?? null : null };
}

// ── Member activity report (on demand, 1:1 or club-wide) ────────────────────
// An officer sends a member their own record: one calendar month, or everything
// since they joined. Counts roles already played and roles booked at meetings
// still to come, so someone signed up for next Saturday is never told they've
// taken nothing on. Never deduped: it's an explicit, repeatable action, not a
// scheduled send.
//
// A member with nothing on record gets the encouragement template instead of an
// empty table, so a club-wide run reaches everyone with something worth reading.

export type ActivityTemplate = 'activity_report' | 'activity_encouragement';

// Everything needed to render one member's activity email, without sending it.
// Shared by the send path and the admin preview so what an officer sees on
// screen is exactly what lands in the member's inbox.
export async function buildActivityEmail(memberId: string, month: string | null): Promise<
  | { skipped: string }
  | { templateKey: ActivityTemplate; email: string; displayName: string; vars: TemplateVars }
> {
  const supabase = createServiceClient();

  const { data: member } = await supabase
    .from('members').select('id, name, display_name, email, active, created_at')
    .eq('id', memberId).single();
  if (!member) return { skipped: 'member not found' };
  if (!member.email) return { skipped: 'no email' };

  const { data: claims } = await supabase
    .from('role_claims')
    .select('role_key, slot_index, meeting:meetings(id, number, date, theme)')
    .eq('member_id', memberId);

  type ClaimWithMeeting = {
    role_key: RoleKey;
    slot_index: number;
    meeting: { id: string; number: number; date: string; theme: string | null } | null;
  };

  const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

  // Roles booked for meetings still to come count too: someone already down as
  // Timer for next Saturday has taken a role, and must not be told they
  // haven't. Upcoming ones are flagged in the table so the list still reads
  // honestly as a record.
  const relevant = ((claims ?? []) as unknown as ClaimWithMeeting[])
    .filter((c) => c.meeting)
    .filter((c) => !month || c.meeting!.date.startsWith(month));

  const appUrl = await getAppUrl();
  const base = {
    club_name: CLUB_NAME,
    app_url: appUrl,
    full_name: member.name || member.display_name,
  };
  const common = { email: member.email as string, displayName: member.display_name };

  // ── Nothing on record: the warm version ──────────────────────────────────
  if (relevant.length === 0) {
    // Give them something concrete to say yes to: what's actually open at the
    // next meeting. Degrades to a bare invitation when nothing is scheduled.
    const { data: meetings } = await supabase
      .from('meetings').select('id, number, date, start_time, end_time, theme, meeting_link')
      .gte('date', todayIst).order('date', { ascending: true }).limit(1);
    const next = (meetings ?? [])[0] as MeetingRow | undefined;
    const open = next ? await openRolesFor(next.id) : { count: 0, listHtml: '' };

    return {
      ...common,
      templateKey: 'activity_encouragement',
      vars: {
        ...base,
        period_label: month ? `in ${monthLabel(month)}` : 'just yet',
        next_meeting_line: next && open.count > 0
          ? `<p style="${'margin:0 0 8px;color:#475569;font-size:15px;line-height:1.6;'}">Here&apos;s what&apos;s still open at <strong style="color:#1e293b;">Meeting #${next.number}</strong> on ${escapeHtml(formatDate(next.date))}:</p>`
          : '',
        open_roles_list: open.listHtml,
        open_roles_count: String(open.count),
      },
    };
  }

  // ── Group by meeting so two roles at one meeting read as one row ─────────
  const byMeeting = new Map<string, { number: number; date: string; theme: string | null; roles: RoleKey[] }>();
  for (const c of relevant) {
    const m = c.meeting!;
    const entry = byMeeting.get(m.id) ?? { number: m.number, date: m.date, theme: m.theme, roles: [] };
    entry.roles.push(c.role_key);
    byMeeting.set(m.id, entry);
  }
  const rows = [...byMeeting.values()].sort((a, b) => b.date.localeCompare(a.date));

  const tableRows = rows.map((r) => {
    const roles = r.roles
      .map((rk) => `${ROLE_META[rk]?.emoji ?? ''} ${escapeHtml(ROLE_META[rk]?.label ?? rk)}`)
      .join(', ');
    // Marked so a booking that hasn't happened yet isn't read as something done.
    const upcoming = r.date > todayIst
      ? ' <span style="color:#9d1530;font-weight:700;">· coming up</span>'
      : '';
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:top;">
        <p style="margin:0;color:#1e293b;font-size:14px;font-weight:700;">Meeting #${r.number}</p>
        <p style="margin:2px 0 0;color:#94a3b8;font-size:12px;">${escapeHtml(formatDate(r.date))}${upcoming}</p>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;">
        <p style="margin:0;color:#475569;font-size:13px;font-weight:600;">${roles}</p>
      </td>
    </tr>`;
  }).join('');

  // The role they've played most — a nudge toward variety without saying so.
  const tally = new Map<RoleKey, number>();
  for (const c of relevant) tally.set(c.role_key, (tally.get(c.role_key) ?? 0) + 1);
  const [topRole, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

  return {
    ...common,
    templateKey: 'activity_report',
    vars: {
      ...base,
      period_label: month
        ? `in ${monthLabel(month)}`
        : `since you joined in ${monthLabel(String(member.created_at).slice(0, 7))}`,
      activity_table: `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #f1f5f9;">${tableRows}</table>`,
      meetings_count: String(rows.length),
      roles_count: String(relevant.length),
      top_roles_line: topRole && topCount > 1
        ? `<p style="margin:10px 0 0;color:#64748b;font-size:13px;">Most often: ${ROLE_META[topRole]?.emoji ?? ''} ${escapeHtml(ROLE_META[topRole]?.label ?? topRole)} (${topCount}×)</p>`
        : '',
    },
  };
}

export async function sendMemberActivityReport(params: { memberId: string; month: string | null }) {
  const built = await buildActivityEmail(params.memberId, params.month);
  if ('skipped' in built) return built;
  const res = await sendOne(built.templateKey, built.email, built.vars);
  return 'ok' in res ? { ...res, template: built.templateKey } : res;
}

// Dry run of the same selection the club-wide send would make: who'd receive
// something, and which of the two emails each would get. Sends nothing, so an
// officer can check the audience before committing to it.
export async function previewActivityRun(
  month: string | null,
  opts?: { onlyWithoutRoles?: boolean },
) {
  const supabase = createServiceClient();
  const { data: members } = await supabase
    .from('members').select('id, name, display_name, active, email').eq('active', true).order('name');

  const recipients: { id: string; name: string; email: string; template: ActivityTemplate }[] = [];
  let passedOver = 0;
  let skipped = 0;

  for (const m of (members ?? []).filter((x) => x.email)) {
    const built = await buildActivityEmail(m.id as string, month);
    if ('skipped' in built) { skipped++; continue; }
    if (opts?.onlyWithoutRoles && built.templateKey !== 'activity_encouragement') {
      passedOver++;
      continue;
    }
    recipients.push({
      id: m.id as string,
      name: (m.display_name as string) || (m.name as string),
      email: built.email,
      template: built.templateKey,
    });
  }
  return { recipients, passedOver, skipped };
}

// Club-wide run: every active member with an email gets whichever of the two
// emails fits their record. Reports back how many of each went out so the
// officer can see that the quiet members were reached too.
//
// `onlyWithoutRoles` narrows it to members who took nothing on in the period —
// everyone else is left alone entirely, so it's a gentle prompt to the people
// who'd benefit rather than a club-wide mailing.
export async function sendActivityReportToAll(
  month: string | null,
  opts?: { onlyWithoutRoles?: boolean },
) {
  const supabase = createServiceClient();
  const { data: members } = await supabase
    .from('members').select('id, active, email').eq('active', true);

  let reports = 0;
  let encouragements = 0;
  let skipped = 0;
  let passedOver = 0;
  const reasons: string[] = [];

  for (const m of (members ?? []).filter((x) => x.email)) {
    const built = await buildActivityEmail(m.id as string, month);
    if ('skipped' in built) {
      skipped++;
      if (!reasons.includes(built.skipped)) reasons.push(built.skipped);
      continue;
    }
    // They were active in the period — nothing to say to them on this run.
    if (opts?.onlyWithoutRoles && built.templateKey !== 'activity_encouragement') {
      passedOver++;
      continue;
    }
    const res = await sendOne(built.templateKey, built.email, built.vars);
    if ('ok' in res) {
      if (built.templateKey === 'activity_report') reports++;
      else encouragements++;
    } else {
      skipped++;
      const why = 'skipped' in res ? res.skipped : res.error;
      if (why && !reasons.includes(why)) reasons.push(why);
    }
  }
  return { ok: true as const, reports, encouragements, skipped, passedOver, reasons };
}

// "2026-08" → "August 2026". Falls back to the raw value if it isn't a month.
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ── 1-day-before per-role reminders (1:1, deduped per member) ───────────────
export async function sendRoleReminders(meeting: MeetingRow, opts?: { dedupe?: boolean }) {
  const supabase = createServiceClient();
  const [{ data: members }, { data: claims }] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, active'),
    supabase.from('role_claims').select('role_key, slot_index, member_id, guest_name').eq('meeting_id', meeting.id),
  ]);
  const byId = new Map((members ?? []).map((m) => [m.id, m as MemberLite]));

  const appUrl = await getAppUrl();
  let sent = 0;
  for (const c of (claims ?? []) as ClaimLite[]) {
    const m = byId.get(c.member_id);
    if (!m?.email) continue;
    const meta = ROLE_META[c.role_key];
    const vars = {
      ...baseMeetingVars(meeting, appUrl),
      full_name: m.name || m.display_name,
      role_label: meta?.label ?? c.role_key,
      role_emoji: meta?.emoji ?? '',
    };
    const res = opts?.dedupe === false
      ? await sendOne('role_reminder', m.email, vars, meeting.id)
      : await sendOneDeduped('role_reminder', m.email, vars, {
          dedupeKey: `role_reminder:${meeting.id}:${c.member_id}:${c.role_key}:${c.slot_index}`, meetingId: meeting.id,
        });
    if ('ok' in res) sent++;
  }
  return { ok: true, sent };
}

// ── Broadcast helpers: re-send a per-member notification to everyone it fits ──
export async function broadcastRoleAssigned(meeting: MeetingRow) {
  const supabase = createServiceClient();
  const [{ data: members }, { data: claims }] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, active'),
    supabase.from('role_claims').select('role_key, slot_index, member_id, guest_name').eq('meeting_id', meeting.id),
  ]);
  const byId = new Map((members ?? []).map((m) => [m.id, m as MemberLite]));
  const appUrl = await getAppUrl();
  let sent = 0;
  for (const c of (claims ?? []) as ClaimLite[]) {
    const m = byId.get(c.member_id);
    if (!m?.email) continue;
    const meta = ROLE_META[c.role_key];
    const res = await sendOne('role_assigned', m.email, {
      ...baseMeetingVars(meeting, appUrl),
      full_name: m.name || m.display_name,
      role_label: meta?.label ?? c.role_key,
      role_emoji: meta?.emoji ?? '',
      actor_line: '',
    }, meeting.id);
    if ('ok' in res) sent++;
  }
  return { sent };
}

export async function broadcastLeadershipAssigned() {
  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select('id, name, display_name, email, active, leadership_roles');
  const appUrl = await getAppUrl();
  let sent = 0;
  for (const m of members ?? []) {
    const roles: LeadershipRole[] = m.leadership_roles ?? [];
    if (!m.email || roles.length === 0) continue;
    const res = await sendOne('leadership_assigned', m.email, {
      club_name: CLUB_NAME, app_url: appUrl,
      full_name: m.name || m.display_name,
      leadership_role: leadershipRoleLabel(roles[0]),
      roles_list: roles.map(leadershipRoleLabel).join(', '),
      actor_line: '',
    });
    if ('ok' in res) sent++;
  }
  return { sent };
}

export async function broadcastMentorAssigned() {
  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select('id, name, display_name, email, active, mentor_id, introduction');
  const byId = new Map((members ?? []).map((m) => [m.id, m]));
  const appUrl = await getAppUrl();
  const base = { club_name: CLUB_NAME, app_url: appUrl };
  let sent = 0;
  for (const mentee of members ?? []) {
    if (!mentee.mentor_id) continue;
    const mentor = byId.get(mentee.mentor_id);
    if (!mentor) continue;
    if (mentee.email) {
      const r = await sendOne('mentor_assigned_to_mentee', mentee.email, {
        ...base, full_name: mentee.name || mentee.display_name,
        mentor_name: mentor.display_name,
        mentor_bio_block: bioBlock(mentor.display_name, mentor.introduction),
      });
      if ('ok' in r) sent++;
    }
    if (mentor.email) {
      const r = await sendOne('mentor_assigned_to_mentor', mentor.email, {
        ...base, full_name: mentor.name || mentor.display_name,
        mentee_name: mentee.display_name,
        mentee_bio_block: bioBlock(mentee.display_name, mentee.introduction),
      });
      if ('ok' in r) sent++;
    }
  }
  return { sent };
}

// Send a free-form message (announcement or admin-written) individually to every
// active member. `messageHtml` should be pre-escaped HTML.
async function broadcastMessage(templateKey: 'announcement' | 'custom_message', extra: Record<string, string>) {
  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select('id, name, display_name, email, active');
  const active = (members ?? []).filter((m) => m.active && m.email);
  if (active.length === 0) return { skipped: 'no recipients' as const };
  const appUrl = await getAppUrl();
  let sent = 0;
  for (const m of active) {
    const res = await sendOne(templateKey, m.email as string, {
      club_name: CLUB_NAME, app_url: appUrl, full_name: m.name || m.display_name, ...extra,
    });
    if ('ok' in res) sent++;
  }
  return { ok: true as const, sent };
}

export function notifyAnnouncement(messageHtml: string) {
  return broadcastMessage('announcement', { message_body: messageHtml });
}

export function sendCustomMessage(subject: string, messageHtml: string) {
  return broadcastMessage('custom_message', { subject, message_body: messageHtml });
}

export async function broadcastWelcome() {
  const supabase = createServiceClient();
  const { data: members } = await supabase.from('members').select('id, name, display_name, email, active');
  const appUrl = await getAppUrl();
  let sent = 0;
  for (const m of members ?? []) {
    if (!m.active || !m.email) continue;
    const res = await sendOne('welcome', m.email, {
      club_name: CLUB_NAME, app_url: appUrl, full_name: m.name || m.display_name,
    });
    if ('ok' in res) sent++;
  }
  return { sent };
}

// ── Preview / test vars built from REAL data ────────────────────────────────
// Uses the next upcoming meeting (or the most recent one) and its actual roles,
// the configured app URL, and the admin's own name — so previews and test sends
// reflect what real emails contain, not fabricated sample data. Per-recipient
// fields fall back to a bracketed placeholder when nothing real is available.
export async function buildPreviewVars(adminId?: string, targetId?: string): Promise<TemplateVars> {
  const supabase = createServiceClient();
  const appUrl = await getAppUrl();
  const [{ data: meetings }, { data: members }] = await Promise.all([
    supabase.from('meetings').select('id, number, date, start_time, end_time, theme, meeting_link').order('date', { ascending: true }),
    supabase.from('members').select('id, name, display_name, email, active, leadership_roles'),
  ]);
  const byId = new Map((members ?? []).map((m) => [m.id, m as MemberLite]));
  const admin = adminId ? byId.get(adminId) : undefined;
  const target = targetId ? byId.get(targetId) : undefined;
  const targetRoles: LeadershipRole[] = (members ?? []).find((m) => m.id === targetId)?.leadership_roles ?? [];
  const rolesList = targetRoles.map(leadershipRoleLabel).join(', ');
  const leadershipRoleSample = targetRoles[0] ? leadershipRoleLabel(targetRoles[0]) : '[Leadership role]';
  // Same lookup sendOne uses, so a preview signs off exactly like the real
  // thing (it also requires the VP to be an active member).
  const vpEducationName = await getVpEducationName();

  const meeting = pickUpcomingMeeting((meetings ?? []) as MeetingRow[]);

  if (!meeting) {
    return {
      club_name: CLUB_NAME, app_url: appUrl,
      meeting_number: '—', meeting_date: 'your next meeting', meeting_time: '', meeting_theme: 'To be decided',
      meeting_link_block: '', roles_summary: '',
      open_roles_list: '', open_roles_count: '0',
      period_label: 'this month', activity_table: '', meetings_count: '0', roles_count: '0', top_roles_line: '',
      next_meeting_line: '',
      full_name: target?.name ?? admin?.name ?? '[Member name]', role_label: 'Timer', role_emoji: '⌛️',
      roles_list: rolesList || '[Leadership roles]',
      leadership_role: leadershipRoleSample,
      actor_line: '', speaker_name: target?.display_name ?? '[Speaker]', evaluator_name: '[Evaluator]',
      status_title: 'Request approved 🎉', status_body: 'This is a sample status message shown in the preview.', review_comment_block: '',
      mentor_name: '[Mentor]', mentee_name: '[Mentee]',
      mentor_bio_block: bioBlock('Sample Mentor', 'An enthusiastic Toastmaster who loves mentoring new members.'),
      mentee_bio_block: bioBlock('Sample Mentee', 'A new member excited to begin their Toastmasters journey.'),
      subject: 'Sample subject line', message_body: 'This is a sample message body shown in the preview.',
      vp_education_name: vpEducationName,
    };
  }

  const { data: claims } = await supabase
    .from('role_claims').select('role_key, slot_index, member_id, guest_name').eq('meeting_id', meeting.id);
  const claimList = (claims ?? []) as ClaimLite[];
  // Prefer the target's own role in this meeting; else the first claim as a sample.
  const relevantClaim = (target ? claimList.find((c) => c.member_id === target.id) : null) ?? claimList[0];
  const meta = relevantClaim ? ROLE_META[relevantClaim.role_key] : null;
  const subjectMember = target ?? (claimList[0] ? byId.get(claimList[0].member_id) : undefined);

  // Real vacancies for the upcoming meeting, so the preview matches what would
  // actually be sent — including the filled/open split in the roles summary.
  const openRoles = await openRolesFor(meeting.id);
  const { data: fullMeeting } = await supabase.from('meetings')
    .select('id, speaker_slots, evaluator_slots, jury_slots, disabled_roles, meeting_type')
    .eq('id', meeting.id).single();
  const allRoles = fullMeeting ? getMeetingRoles(fullMeeting as unknown as Meeting) : undefined;

  return {
    ...baseMeetingVars(meeting, appUrl),
    roles_summary: rolesSummaryHtml(claimList, byId, allRoles),
    open_roles_list: openRoles.listHtml,
    open_roles_count: String(openRoles.count),
    // The activity report is built per-member at send time; the preview shows
    // the shape with the meeting to hand rather than a real member's history.
    period_label: 'this month',
    activity_table: rolesSummaryHtml(claimList, byId),
    meetings_count: '1',
    roles_count: String(claimList.length),
    top_roles_line: '',
    next_meeting_line: '',
    full_name: subjectMember?.name ?? admin?.name ?? '[Member name]',
    role_label: meta?.label ?? 'Timer',
    role_emoji: meta?.emoji ?? '⌛️',
    roles_list: rolesList || '[Leadership roles]',
    leadership_role: leadershipRoleSample,
    actor_line: admin ? ` This was done by Admin TM ${escapeHtml(admin.display_name)}.` : '',
    speaker_name: subjectMember?.display_name ?? '[Speaker]',
    evaluator_name: admin?.display_name ?? '[Evaluator]',
    status_title: 'Request approved 🎉', status_body: 'This is a sample status message shown in the preview.', review_comment_block: '',
    mentor_name: subjectMember?.display_name ?? '[Mentor]', mentee_name: '[Mentee]',
    mentor_bio_block: bioBlock('Sample Mentor', 'An enthusiastic Toastmaster who loves mentoring new members.'),
    mentee_bio_block: bioBlock('Sample Mentee', 'A new member excited to begin their Toastmasters journey.'),
    subject: 'Sample subject line', message_body: 'This is a sample message body shown in the preview.',
    vp_education_name: vpEducationName,
  };
}
