// High-level, server-only notification helpers. Callers (API routes + the
// reminder cron) stay thin; these do the DB reads and build template vars.
import { createServiceClient } from '@/utils/supabase/server';
import { ROLE_META, leadershipRoleLabel, type RoleKey, type LeadershipRole } from '@/lib/types';
import { formatDate, formatTime, escapeHtml, bioBlock } from './format';
import { sendOne, sendOneDeduped, getAppUrl, getEmailSettings } from './mailer';
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

interface ClaimLite { role_key: RoleKey; slot_index: number; member_id: string }
interface MemberLite { id: string; name: string; display_name: string; email: string | null; active: boolean }

function rolesSummaryHtml(claims: ClaimLite[], byId: Map<string, MemberLite>): string {
  if (claims.length === 0) return '';
  const rows = claims
    .map((c) => {
      const meta = ROLE_META[c.role_key];
      if (!meta) return null;
      const m = byId.get(c.member_id);
      const name = m ? `TM ${escapeHtml(m.display_name)}` : '—';
      const label = meta.label + (['speaker', 'evaluator', 'jury'].includes(c.role_key) ? ` ${c.slot_index}` : '');
      return `<tr><td style="padding:5px 0;color:#64748b;font-size:13px;">${meta.emoji} ${label}</td>
        <td style="padding:5px 0;color:#1e293b;font-size:13px;font-weight:600;text-align:right;">${name}</td></tr>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<p style="${KICKER}">Roles filled so far</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #f1f5f9;">${rows}</table>`;
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
  const [{ data: members }, { data: claims }] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, active'),
    supabase.from('role_claims').select('role_key, slot_index, member_id').eq('meeting_id', meeting.id),
  ]);
  const active = (members ?? []).filter((m) => m.active && m.email);
  if (active.length === 0) return { skipped: 'no recipients' as const };

  const byId = new Map((members ?? []).map((m) => [m.id, m as MemberLite]));
  const appUrl = await getAppUrl();
  const rolesSummary = rolesSummaryHtml((claims ?? []) as ClaimLite[], byId);

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

// ── 1-day-before per-role reminders (1:1, deduped per member) ───────────────
export async function sendRoleReminders(meeting: MeetingRow, opts?: { dedupe?: boolean }) {
  const supabase = createServiceClient();
  const [{ data: members }, { data: claims }] = await Promise.all([
    supabase.from('members').select('id, name, display_name, email, active'),
    supabase.from('role_claims').select('role_key, slot_index, member_id').eq('meeting_id', meeting.id),
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
    supabase.from('role_claims').select('role_key, slot_index, member_id').eq('meeting_id', meeting.id),
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
  const vpEd = (members ?? []).find((m) => ((m as { leadership_roles?: LeadershipRole[] }).leadership_roles ?? []).includes('vp_education'));
  const vpEducationName = vpEd?.display_name ?? '';

  const meeting = pickUpcomingMeeting((meetings ?? []) as MeetingRow[]);

  if (!meeting) {
    return {
      club_name: CLUB_NAME, app_url: appUrl,
      meeting_number: '—', meeting_date: 'your next meeting', meeting_time: '', meeting_theme: 'To be decided',
      meeting_link_block: '', roles_summary: '',
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
    .from('role_claims').select('role_key, slot_index, member_id').eq('meeting_id', meeting.id);
  const claimList = (claims ?? []) as ClaimLite[];
  // Prefer the target's own role in this meeting; else the first claim as a sample.
  const relevantClaim = (target ? claimList.find((c) => c.member_id === target.id) : null) ?? claimList[0];
  const meta = relevantClaim ? ROLE_META[relevantClaim.role_key] : null;
  const subjectMember = target ?? (claimList[0] ? byId.get(claimList[0].member_id) : undefined);

  return {
    ...baseMeetingVars(meeting, appUrl),
    roles_summary: rolesSummaryHtml(claimList, byId),
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
