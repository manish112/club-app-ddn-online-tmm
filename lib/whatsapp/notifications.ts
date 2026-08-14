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
import { getAppUrl, getVpEducationName, getVpMembershipName } from '@/lib/email/mailer';
import { pickUpcomingMeeting, type MeetingRow } from '@/lib/email/notifications';
import {
  deliverWhatsApp, getWhatsAppSettings, normalizePhone, sendTextMessage, type WaSendResult,
} from './client';
import {
  WA_AUTO_REPLY_KEY, WA_DIRECT_KEY, WA_MEETINGLESS_KEYS, WA_MEMBER_ROLE_KEYS, WA_MEMBER_SEND_KEYS,
  type WaTemplateKey,
} from './defaults';
import type { TemplateVars } from '@/lib/email/render';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Toastmasters International's own club page — where a stranger who has
// texted the number can find the club and how to visit, independent of
// anything this app hosts.
const CLUB_FINDER_URL = 'https://www.toastmasters.org/Find-a-Club/28680307-dehradun-online-toastmasters-club';

const MULTI_SLOT_ROLES = ['speaker', 'evaluator', 'jury'];

interface WaMemberLite {
  id: string;
  name: string;
  display_name: string;
  phone: string | null;
  active: boolean;
  /** Admin gate (migration 058). Required, not optional: a caller that forgets
   *  to select it must be a type error, not a silent charge to the club. */
  whatsapp_enabled: boolean | null;
  whatsapp_notifications?: boolean;
}

const MEMBER_COLS =
  'id, name, display_name, phone, active, whatsapp_enabled, whatsapp_notifications';

// Why this member cannot be messaged, or null when they can. Every 1:1 send
// reports this verbatim, because "nothing happened" is the least useful thing an
// admin can be told about a WhatsApp message.
//
// The two flags are asymmetric on purpose. The admin gate must be an explicit
// true — it decides whether the club pays for this member at all, so anything
// unknown counts as "not authorised". The member's own opt-out is only a
// preference, so undefined (a column not yet migrated) counts as opted in.
export function waMemberSkipReason(
  m: Pick<WaMemberLite, 'active' | 'phone' | 'whatsapp_enabled' | 'whatsapp_notifications'>,
  countryCode: string,
): string | null {
  if (!m.active) return 'member is not active';
  if (m.whatsapp_enabled !== true) return 'WhatsApp is not enabled for this member';
  if (m.whatsapp_notifications === false) return 'the member has turned WhatsApp off in their profile';
  if (!normalizePhone(m.phone, countryCode)) return 'no usable phone number';
  return null;
}

// Everyone the club may message and who still wants to hear from it.
function reachable(members: WaMemberLite[] | null | undefined, countryCode: string): WaMemberLite[] {
  return (members ?? []).filter((m) => !waMemberSkipReason(m, countryCode));
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

// Agenda order, so a member holding two roles always reads them in the same
// order the meeting runs in rather than in whatever order the rows came back.
const ROLE_ORDER = Object.keys(ROLE_META) as RoleKey[];

interface HeldRole { roleKey: RoleKey; slot: number }

function sortRoles(roles: HeldRole[]): HeldRole[] {
  return [...roles].sort((a, b) =>
    ROLE_ORDER.indexOf(a.roleKey) - ROLE_ORDER.indexOf(b.roleKey) || a.slot - b.slot);
}

/**
 * The roles a member holds, as one body parameter: "Timer", "Timer &
 * Ah-Counter", "TMoD, Timer & Ah-Counter".
 *
 * One line, because Meta rejects a body parameter containing newlines — the same
 * constraint `open_roles_list` lives under. The "&" before the last one is what
 * makes it read as a sentence: the templates say "you are our *{{role_label}}*",
 * and a trailing comma there would read as a truncated list.
 */
function joinRoleLabels(roles: HeldRole[]): string {
  const labels = sortRoles(roles).map((r) => roleLabel(r.roleKey, r.slot));
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
}

// Claims folded down to one entry per member. Guest slots (member_id null) and
// role keys the app no longer knows about drop out — neither can be messaged or
// named.
function rolesByMember(
  claims: { role_key: string; slot_index: number; member_id: string | null }[] | null,
): Map<string, HeldRole[]> {
  const byMember = new Map<string, HeldRole[]>();
  for (const c of claims ?? []) {
    if (!c.member_id || !ROLE_META[c.role_key as RoleKey]) continue;
    const held = byMember.get(c.member_id) ?? [];
    held.push({ roleKey: c.role_key as RoleKey, slot: c.slot_index });
    byMember.set(c.member_id, held);
  }
  return byMember;
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
// One message per *member*, naming every role they hold: someone down as both
// Timer and Ah-Counter reads "you are our Timer & Ah-Counter" once. Two messages
// a second apart would bill the club twice for the same reminder and read on the
// phone as a glitch rather than as thoroughness.
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

  for (const [memberId, held] of rolesByMember(claims)) {
    const m = byId.get(memberId);
    if (!m || reachable([m], settings.default_country_code).length === 0) continue;

    const res = await deliverWhatsApp({
      key: 'role_reminder',
      phone: m.phone as string,
      meetingId: meeting.id,
      vars: { ...base, full_name: m.name || m.display_name, role_label: joinRoleLabels(held) },
      // Keyed on the member, not the role: one message now covers all of them, so
      // a per-role key would let the same reminder go out once per role again.
      dedupeKey: opts?.dedupe === false ? undefined : `wa_role_reminder:${meeting.id}:${memberId}`,
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

// ── Auto-reply to an inbound WhatsApp message ───────────────────────────────
// Anyone who texts the club's number gets an answer. A member's own phone
// gets the next meeting's details — theme, join link, who has which role; a
// number that matches nobody gets pointed at VP Membership and the club's
// public page instead, since the agenda is for members and a stranger texting
// in is far more likely asking how to join.
//
// This is free text, not a template: Meta only allows business-initiated
// messages through an approved template, but a reply inside the 24-hour
// window the inbound message itself just opened may say anything, in any
// shape, including the multi-line layout Meta's body-parameter rule forbids
// elsewhere in this file.
//
// Deduped once per phone per (UTC) calendar day — reusing the day as the
// dedupe scope is what stops a burst of messages from the same person
// producing a burst of identical replies, and also absorbs a webhook retry of
// the same delivery for free, the same way every scheduled send in this file
// already relies on a claimed key rather than checking-then-sending.
async function buildAutoReplyText(fromE164: string, countryCode: string): Promise<string> {
  const supabase = createServiceClient();
  const [{ data: members }, meeting] = await Promise.all([
    supabase.from('members').select('id, name, display_name, phone, active'),
    upcomingMeetingRow(),
  ]);

  // Best-effort name match, same rule the message log uses to turn a bare
  // number back into a member: normalise every stored phone the same way and
  // compare digits.
  const match = (members ?? []).find(
    (m) => m.active && normalizePhone(m.phone as string | null, countryCode) === fromE164,
  );

  // A number that doesn't match anyone isn't shown the agenda — meeting links
  // and who holds which role are for members, not for whoever has the club's
  // number. They're pointed at the person who can actually help them, and at
  // the club's own public page, instead.
  if (!match) {
    const vpName = await getVpMembershipName();
    return 'Hi there,\n\n'
      + `Please reach out to the club VP Membership, TM ${vpName || '(see the club page below)'}, `
      + 'to know more about the club, or visit our website:\n'
      + `${CLUB_FINDER_URL}`;
  }

  const greeting = `Hi TM ${match.name || match.display_name} 👋`;
  const appUrl = await getAppUrl();

  if (!meeting) {
    return `${greeting}\n\nThere's no meeting on the calendar right now. Check back soon, or see `
      + `everything the club is up to in the app:\n${appUrl}`;
  }

  const sheet = await roleSheetLines(meeting.id);
  return [
    greeting,
    '',
    'Here are the next meeting’s details:',
    '',
    `📅 *Meeting #${meeting.number}* · ${formatDate(meeting.date)}`,
    `⏰ ${formatTime(meeting.start_time)}–${formatTime(meeting.end_time)} IST`,
    `🌐 Theme: ${meeting.theme && meeting.theme !== 'TBD' ? meeting.theme : 'To be decided'}`,
    `🔗 Join: ${meeting.meeting_link?.trim() || 'To be set'}`,
    '',
    '✅ *Roles taken*',
    sheet.taken,
    '',
    '🟡 *Roles open*',
    sheet.open,
    '',
    'To see the full agenda, claim or change a role, visit our club app:',
    appUrl,
  ].join('\n');
}

export async function waAutoReplyToInboundMessage(params: {
  from: string;   // Meta's own E.164 digits, no '+'
}): Promise<{ ok: true } | { skipped: string } | { error: string }> {
  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };
  if (!settings.auto_reply_enabled) return { skipped: 'auto-reply off' };
  if (!settings.access_token || !settings.phone_number_id) return { skipped: 'whatsapp not configured' };

  const supabase = createServiceClient();
  const day = new Date().toISOString().slice(0, 10);
  const dedupeKey = `wa_auto_reply:${params.from}:${day}`;

  // Claim the day before doing any work — a second callback for the same
  // delivery (Meta's own retry, or two texts a second apart) hits the unique
  // constraint and stops here rather than sending twice.
  const { data: claimed, error: claimError } = await supabase
    .from('whatsapp_sends')
    .insert({ dedupe_key: dedupeKey, template_key: WA_AUTO_REPLY_KEY, recipient: params.from, status: 'sent' })
    .select('id').single();
  if (claimError) {
    if (claimError.code === '23505') return { skipped: 'already replied to this number today' };
    return { error: `could not write the send log — ${claimError.message}` };
  }

  const text = await buildAutoReplyText(params.from, settings.default_country_code);
  const result = await sendTextMessage(settings, params.from, text);

  if ('ok' in result) {
    await supabase.from('whatsapp_sends')
      .update({ wa_message_id: result.messageId ?? null })
      .eq('id', claimed.id);
    return { ok: true };
  }

  // Clear the dedupe key on failure, matching deliverWhatsApp: a transient API
  // error shouldn't cost the member their one reply for the day.
  const reason = 'error' in result ? result.error : result.skipped;
  await supabase.from('whatsapp_sends')
    .update({ dedupe_key: null, status: 'error', error: reason })
    .eq('id', claimed.id);
  return 'error' in result ? { error: reason } : { skipped: reason };
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
  target: { id: string; name: string; display_name: string; phone: string | null; active: boolean; whatsapp_enabled: boolean | null; whatsapp_notifications?: boolean };
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
  const blocked = waMemberSkipReason(target, settings.default_country_code);
  if (blocked) return { skipped: blocked };

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
  const { data: member, error } = await supabase
    .from('members').select(MEMBER_COLS).eq('id', memberId).single();
  if (error) return { skipped: `this member could not be read — ${error.message}` };
  if (!member) return { skipped: 'member not found' };
  // The commonest outcome now, and deliberately so: a member added without the
  // WhatsApp box ticked is not messaged, so nobody costs the club anything until
  // an admin decides they should.
  const blocked = waMemberSkipReason(member as WaMemberLite, settings.default_country_code);
  if (blocked) return { skipped: blocked };

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

// ── One member, one message, on demand ──────────────────────────────────────
// The counterpart to the club-wide sends: an admin looking at a single member's
// row can message that member and nobody else. What this is for is the club that
// pays per message — enable WhatsApp for one person, send them the welcome, and
// spend nothing on the other forty.
//
// The per-notification schedule toggles are deliberately NOT consulted (the
// broadcast sends behave the same way): an admin pressing a button has already
// decided, and "the welcome is off in settings" is a statement about the
// automatic send, not about this one. The connection switch, the per-member gate,
// the member's own opt-out and the template's own on/off all still apply.

export interface WaMemberSendOption {
  key: WaTemplateKey;
  /** Why it can't be sent right now, or null when it can. */
  unavailable: string | null;
}

async function upcomingMeetingRow(): Promise<MeetingRow | undefined> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('meetings')
    .select('id, number, date, start_time, end_time, theme, meeting_link')
    .order('date', { ascending: true });
  return pickUpcomingMeeting((data ?? []) as MeetingRow[]);
}

// The roles this member holds at a meeting, as (role, slot) pairs. Both
// role-specific messages need them, and neither may be sent without one — the
// role label is real data, not something a manual send invents.
async function memberRolesAt(meetingId: string, memberId: string): Promise<{ roleKey: RoleKey; slot: number }[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('role_claims')
    .select('role_key, slot_index').eq('meeting_id', meetingId).eq('member_id', memberId);
  return (data ?? [])
    .filter((c) => ROLE_META[c.role_key as RoleKey])
    .map((c) => ({ roleKey: c.role_key as RoleKey, slot: c.slot_index as number }));
}

export interface WaMemberSendCandidate {
  id: string;
  name: string;
  /** Why this member can't be messaged, or null when they can. */
  unavailable: string | null;
}

/**
 * Everyone who could be picked as the recipient of a one-off message, each
 * carrying the reason they can't be — so the picker can list the whole active
 * roster and still refuse the ones the club hasn't enabled. An admin wondering
 * why somebody is missing gets an answer in the list instead of an absence.
 */
export async function waMemberSendRoster(): Promise<{
  members: WaMemberSendCandidate[];
  error: string | null;
}> {
  const settings = await getWhatsAppSettings();
  const cc = settings?.default_country_code ?? '91';

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('members').select(MEMBER_COLS).order('name');
  if (error) return { members: [], error: `the members table could not be read — ${error.message}` };

  // Inactive members are left out rather than listed as unavailable: they are
  // absent from every other picker in the app, and "not active" is not a reason
  // an admin would be looking to fix here.
  const members = ((data ?? []) as WaMemberLite[])
    .filter((m) => m.active)
    .map((m) => ({
      id: m.id,
      name: m.display_name || m.name,
      unavailable: waMemberSkipReason(m, cc),
    }));

  return { members, error: null };
}

/**
 * What an admin may send to this one member, and why anything missing is
 * missing — worked out before the send so the panel can grey out a button and
 * say what would need to change, rather than reporting a failure afterwards.
 */
export async function waMemberSendOptions(memberId: string): Promise<{
  reason: string | null;                 // why this member can't be messaged at all
  meeting: MeetingRow | null;
  roles: string[];                       // role labels held at that meeting
  options: WaMemberSendOption[];
}> {
  const settings = await getWhatsAppSettings();
  const supabase = createServiceClient();
  // The error is reported rather than folded into "member not found": on a
  // database still missing migration 058 this select names a column that isn't
  // there, and its message says so — which is the fix, not a missing member.
  const { data: member, error } = await supabase
    .from('members').select(MEMBER_COLS).eq('id', memberId).single();

  const reason = !settings?.enabled
    ? 'WhatsApp notifications are turned off for the whole club'
    : error
      ? `this member could not be read — ${error.message}`
      : !member
        ? 'member not found'
        : waMemberSkipReason(member as WaMemberLite, settings.default_country_code);

  const meeting = await upcomingMeetingRow();
  const roles = meeting ? await memberRolesAt(meeting.id, memberId) : [];
  const open = meeting ? await openRoleSlots(meeting.id) : null;

  const options = WA_MEMBER_SEND_KEYS.map((key) => ({
    key,
    unavailable:
      WA_MEETINGLESS_KEYS.includes(key) ? null
      : !meeting ? 'no meeting is scheduled'
      : WA_MEMBER_ROLE_KEYS.includes(key) && roles.length === 0
        ? 'they hold no role at this meeting'
      : key === 'no_role_nudge' && roles.length > 0
        ? 'they already have a role at this meeting'
      : key === 'no_role_nudge' && open?.roles.length === 0
        ? 'every role at this meeting is taken'
        : null,
  }));

  return {
    reason,
    meeting: meeting ?? null,
    roles: roles.map((r) => roleLabel(r.roleKey, r.slot)),
    options,
  };
}

/** Send one of the templates to one member, with real data. */
export async function waSendToMember(params: {
  memberId: string;
  key: WaTemplateKey;
  /** The admin doing it, named in the role messages' "who did this" line. */
  actor?: { display_name: string } | null;
}): Promise<WaRunResult | { skipped: string }> {
  const { memberId, key } = params;
  if (!WA_MEMBER_SEND_KEYS.includes(key)) return { skipped: 'that message cannot be sent to one member' };

  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('members').select(MEMBER_COLS).eq('id', memberId).single();
  if (error) return { skipped: `this member could not be read — ${error.message}` };
  if (!data) return { skipped: 'member not found' };
  const member = data as WaMemberLite;
  const blocked = waMemberSkipReason(member, settings.default_country_code);
  if (blocked) return { skipped: blocked };

  const appUrl = await getAppUrl();
  const fullName = member.name || member.display_name;

  // The welcome is the one message that isn't about a meeting — which is exactly
  // when it gets sent: an admin has just switched WhatsApp on for someone.
  if (key === 'welcome') {
    const res = await deliverWhatsApp({
      key,
      phone: member.phone as string,
      vars: { ...(await signOffVars()), app_url: appUrl, full_name: fullName },
    });
    return oneResult(res);
  }

  const meeting = await upcomingMeetingRow();
  if (!meeting) return { skipped: 'no meeting scheduled' };
  const base = await baseVars(meeting, appUrl);

  if (WA_MEMBER_ROLE_KEYS.includes(key)) {
    const roles = await memberRolesAt(meeting.id, memberId);
    if (roles.length === 0) return { skipped: 'they hold no role at this meeting' };

    // The reminder names every role in one message, matching the day-before
    // send. `role_assigned` stays one per role: it is about a single role
    // appearing on the agenda, and a list would say something different.
    if (key === 'role_reminder') {
      const res = await deliverWhatsApp({
        key,
        phone: member.phone as string,
        meetingId: meeting.id,
        vars: { ...base, full_name: fullName, role_label: joinRoleLabels(roles) },
      });
      return oneResult(res);
    }

    let sent = 0, failed = 0;
    const reasons: string[] = [];
    for (const r of roles) {
      const res = await deliverWhatsApp({
        key,
        phone: member.phone as string,
        meetingId: meeting.id,
        vars: {
          ...base,
          full_name: fullName,
          role_label: roleLabel(r.roleKey, r.slot),
          actor_line: params.actor
            ? `This was done by Admin TM ${params.actor.display_name}.`
            : 'You are on the agenda for this meeting.',
        },
      });
      if ('ok' in res) sent++;
      else { failed += 'error' in res ? 1 : 0; reasons.push('skipped' in res ? res.skipped : res.error); }
    }
    return summarize(sent, failed, reasons);
  }

  if (key === 'no_role_nudge') {
    const open = await openRoleSlots(meeting.id);
    if (open.roles.length === 0) return { skipped: 'every role at this meeting is taken' };
    if (open.claimedBy.has(memberId)) return { skipped: 'they already have a role at this meeting' };
    const res = await deliverWhatsApp({
      key,
      phone: member.phone as string,
      meetingId: meeting.id,
      vars: {
        ...base,
        full_name: fullName,
        open_roles_count: String(open.roles.length),
        open_roles_list: open.roles.map(({ roleKey, slot }) => roleLabel(roleKey, slot)).join(LIST_SEP),
      },
    });
    return oneResult(res);
  }

  if (key === 'meeting_starting') {
    const sheet = await roleSheetLines(meeting.id);
    const res = await deliverWhatsApp({
      key,
      phone: member.phone as string,
      meetingId: meeting.id,
      vars: { ...base, full_name: fullName, roles_taken: sheet.taken, roles_open: sheet.open },
    });
    return oneResult(res);
  }

  // meeting_created — the announcement, to this member alone.
  const res = await deliverWhatsApp({
    key,
    phone: member.phone as string,
    meetingId: meeting.id,
    vars: { ...base, full_name: fullName },
  });
  return oneResult(res);
}

function oneResult(res: WaSendResult): WaRunResult | { skipped: string } {
  if ('ok' in res) return { ok: true, sent: 1, failed: 0, reason: null };
  if ('skipped' in res) return { skipped: res.skipped };
  return { ok: true, sent: 0, failed: 1, reason: res.error };
}

/**
 * Free text to one member, outside the templates entirely.
 *
 * Meta only delivers this inside the 24-hour customer-service window — i.e. to
 * someone who has messaged the club's number recently. Outside it the send comes
 * back as error 131047, which is reported as-is rather than dressed up: the
 * message genuinely did not arrive, and an admin needs to know that before they
 * assume the member has been told.
 */
export async function waSendDirectText(params: {
  memberId: string;
  text: string;
}): Promise<WaRunResult | { skipped: string }> {
  const text = params.text.trim();
  if (!text) return { skipped: 'nothing to send' };

  const settings = await getWhatsAppSettings();
  if (!settings?.enabled) return { skipped: 'whatsapp disabled' };
  if (!settings.access_token || !settings.phone_number_id) return { skipped: 'whatsapp not configured' };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('members').select(MEMBER_COLS).eq('id', params.memberId).single();
  if (error) return { skipped: `this member could not be read — ${error.message}` };
  if (!data) return { skipped: 'member not found' };
  const member = data as WaMemberLite;
  const blocked = waMemberSkipReason(member, settings.default_country_code);
  if (blocked) return { skipped: blocked };

  const to = normalizePhone(member.phone, settings.default_country_code) as string;
  const result = await sendTextMessage(settings, to, text);

  // Logged like any other send: a direct message is the one most likely to be
  // rejected (the 24-hour window), so it is the one whose failure must be
  // visible in the log rather than only in the admin's own screen.
  await supabase.from('whatsapp_sends').insert({
    template_key: WA_DIRECT_KEY,
    recipient: to,
    wa_message_id: 'ok' in result ? result.messageId ?? null : null,
    status: 'error' in result ? 'error' : 'sent',
    error: 'error' in result ? result.error : null,
  });

  return oneResult(result);
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

  // The admin running the test *is* the actor, and their row is already loaded —
  // so name them, the way a real assignment does. These vars are not only drawn
  // on screen: the test send posts them to Meta as body parameters, and a
  // bracketed "[Admin name]" arrives on a real phone looking like a broken
  // message. Matches waNotifyRoleChange in preferring display_name.
  const actorLine = `This was done by Admin TM ${admin?.display_name || admin?.name || 'your club admin'}.`;

  if (!meeting) {
    return {
      ...(await signOffVars()),
      app_url: appUrl,
      meeting_number: '—', meeting_date: 'your next meeting',
      meeting_time: 'a time yet to be set', meeting_start: 'a time yet to be set',
      meeting_theme: 'To be decided', meeting_link: appUrl,
      full_name: fallbackName, role_label: 'Timer',
      actor_line: actorLine,
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
    actor_line: actorLine,
    open_roles_count: String(open.roles.length),
    open_roles_list: open.roles.map(({ roleKey, slot }) => roleLabel(roleKey, slot)).join(LIST_SEP) || 'none',
    roles_taken: sheet.taken,
    roles_open: sheet.open,
  };
}
