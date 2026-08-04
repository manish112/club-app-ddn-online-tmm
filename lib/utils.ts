import type { Meeting, MeetingWithClaims, Member, ParticipationMode, RoleKey, SpeakerGroup, LeadershipRole } from './types';
import { hasLeadershipRole, specialSessionName } from './types';
import { isRoleEnabled } from './types';
import { ROLE_META, getMeetingRoles } from './types';

// Public app URL used in call-to-action prompts (e.g. WhatsApp agenda).
export const APP_URL = 'https://dehradun-online-tm.vercel.app/';

const TAG_ROLES: RoleKey[] = ['timer', 'ah_counter', 'grammarian', 'harkmaster'];

// ── Speaker groups & speaking order ───────────────────────────────────────────
// A speakathon splits speakers into named groups (heats) and an admin-arrangeable
// speaking order. These helpers give a single source of truth for that layout,
// shared by the meeting card, judging page, WhatsApp copy and the agenda.

export interface SpeakerBucket { group: SpeakerGroup | null; slots: number[] }

// Which group a speaker slot belongs to (null = unassigned / no valid group).
export function groupIdForSlot(meeting: Meeting, slot: number): string | null {
  const ids = new Set((meeting.speaker_groups ?? []).map((g) => g.id));
  const gid = meeting.pair_groups?.[String(slot)];
  return gid && ids.has(gid) ? gid : null;
}

// All speaker slots (1..speaker_slots) in the saved speaking order; slots missing
// from pair_order are appended by natural index.
export function orderedSpeakerSlots(meeting: Meeting): number[] {
  const all = Array.from({ length: meeting.speaker_slots }, (_, i) => i + 1);
  const pref = (meeting.pair_order ?? []).filter((s) => all.includes(s));
  return [...pref, ...all.filter((s) => !pref.includes(s))];
}

// Speakers grouped by heat, each group's slots in speaking order. When no groups
// are defined, returns a single unnamed bucket with all slots in order.
export function speakerBuckets(meeting: Meeting): SpeakerBucket[] {
  const groups = meeting.speaker_groups ?? [];
  const ordered = orderedSpeakerSlots(meeting);
  if (groups.length === 0) return [{ group: null, slots: ordered }];
  const buckets: SpeakerBucket[] = [];
  for (const g of groups) buckets.push({ group: g, slots: ordered.filter((s) => groupIdForSlot(meeting, s) === g.id) });
  const unassigned = ordered.filter((s) => groupIdForSlot(meeting, s) === null);
  if (unassigned.length) buckets.push({ group: null, slots: unassigned });
  return buckets;
}

// True when the meeting is a grouped speakathon (speakers split into named heats).
export function hasSpeakerGroups(meeting: Meeting): boolean {
  return isRoleEnabled(meeting, 'speaker') && (meeting.speaker_groups?.length ?? 0) > 0;
}

// Shared WhatsApp "role player" section. For a grouped speakathon, speakers are
// listed by heat in speaking order (numbered per group, with their speech details
// and paired evaluator); everyone else follows as normal intro blocks.
function buildRolePlayerBlocks(meeting: MeetingWithClaims, membersById: Map<string, Member>): string[] {
  const blocks: string[] = [];
  const grouped = hasSpeakerGroups(meeting);
  const claimFor = (roleKey: RoleKey, slot: number) =>
    meeting.role_claims.find((c) => c.role_key === roleKey && c.slot_index === slot);

  if (grouped) {
    blocks.push('🎙️ *Prepared Speeches*');
    blocks.push('');
    for (const bucket of speakerBuckets(meeting)) {
      const rows: string[] = [];
      let n = 0;
      for (const slot of bucket.slots) {
        const sc = claimFor('speaker', slot);
        const speaker = sc && membersById.get(sc.member_id);
        if (!sc || !speaker) continue;
        n += 1;
        const meta = [sc.path, sc.speech_level ? `L${sc.speech_level}` : null, sc.project].filter(Boolean).join(' · ');
        const title = sc.speech_title ? ` — "${sc.speech_title}"` : '';
        rows.push(`${n}. 🎙️ TM ${speaker.display_name}${title}${meta ? ` (${meta})` : ''}`);
        const ec = claimFor('evaluator', slot);
        const evaluator = ec && membersById.get(ec.member_id);
        if (evaluator) rows.push(`   ⚖️ Evaluator: TM ${evaluator.display_name}`);
      }
      if (rows.length) {
        blocks.push(`*${bucket.group ? bucket.group.name : 'Unassigned'}*`);
        blocks.push(...rows);
        blocks.push('');
      }
    }
  }

  // Speaker & evaluator are folded into the grouped section above for a speakathon.
  const roleOrder = ([
    ...(grouped ? [] : [
      { key: 'speaker'   as RoleKey, slots: meeting.speaker_slots },
      { key: 'evaluator' as RoleKey, slots: meeting.evaluator_slots },
    ]),
    { key: 'jury'       as RoleKey, slots: meeting.jury_slots ?? 0 },
    { key: 'tmod'       as RoleKey, slots: 1 },
    { key: 'ttm'        as RoleKey, slots: 1 },
    { key: 'ge'         as RoleKey, slots: 1 },
    { key: 'timer'      as RoleKey, slots: 1 },
    { key: 'ah_counter' as RoleKey, slots: 1 },
    { key: 'grammarian' as RoleKey, slots: 1 },
    { key: 'harkmaster' as RoleKey, slots: 1 },
  ] as { key: RoleKey; slots: number }[]).filter((r) => isRoleEnabled(meeting, r.key));

  for (const { key, slots } of roleOrder) {
    const meta = ROLE_META[key];
    for (let slot = 1; slot <= slots; slot++) {
      const claim = claimFor(key, slot);
      if (!claim) continue;
      const member = membersById.get(claim.member_id);
      if (!member) continue;
      const label = slots > 1
        ? `${meta.emoji} ${meta.label} ${slot} – TM ${member.display_name}`
        : `${meta.emoji} ${meta.label} – TM ${member.display_name}`;
      blocks.push(label);
      if (member.introduction) blocks.push(member.introduction);
      blocks.push('');
    }
  }
  return blocks;
}

export function roleClaimBlocked(
  targetRole: RoleKey,
  existingRoles: RoleKey[]
): string | null {
  if (existingRoles.length === 0) return null;
  if (existingRoles.includes('tmod')) return 'TMoD cannot take other roles';
  if (targetRole === 'tmod') return 'TMoD must be the only role';
  if (existingRoles.length >= 3) return 'Max 3 roles per meeting';
  if (targetRole === 'speaker' && existingRoles.includes('speaker')) return 'Cannot take two speaker slots';
  if (TAG_ROLES.includes(targetRole) && existingRoles.some((r) => TAG_ROLES.includes(r))) {
    return 'Only one auxiliary role per member';
  }
  return null;
}

// Rotation rule: a member may not hold the same role in two consecutive
// meetings. Evaluator is exempt — the club has few evaluators and the VPED
// routinely reassigns them. Admins bypass this entirely (admin override).
// `adjacentRoles` are the roles the member already holds in the immediately
// previous and immediately next meetings (see getAdjacentMemberRoles).
export function consecutiveRoleBlocked(
  targetRole: RoleKey,
  adjacentRoles: RoleKey[]
): string | null {
  if (targetRole === 'evaluator') return null;
  if (adjacentRoles.includes(targetRole)) {
    return 'Same role back-to-back';
  }
  return null;
}

// Roles the member holds in the meetings immediately before and after the
// given meeting (by meeting number, so gaps in numbering are handled). Used to
// enforce the no-repeat-in-consecutive-meetings rule.
export function getAdjacentMemberRoles(
  meetings: MeetingWithClaims[],
  meetingId: string,
  memberId: string
): RoleKey[] {
  const sorted = [...meetings].sort((a, b) => a.number - b.number);
  const i = sorted.findIndex((m) => m.id === meetingId);
  if (i === -1) return [];
  const neighbours = [sorted[i - 1], sorted[i + 1]].filter(Boolean) as MeetingWithClaims[];
  const roles = new Set<RoleKey>();
  for (const mtg of neighbours) {
    for (const c of mtg.role_claims) {
      if (c.member_id === memberId) roles.add(c.role_key);
    }
  }
  return [...roles];
}

// The member's most recent meetings (by number, newest first) in which they
// held at least one role, capped at `limit`. Drives the advice modal so a
// member can see their recent rotation at a glance.
export function getMemberRecentRoles(
  meetings: MeetingWithClaims[],
  memberId: string,
  limit = 5
): { meeting: MeetingWithClaims; roles: RoleKey[] }[] {
  return [...meetings]
    .sort((a, b) => b.number - a.number)
    .map((m) => ({
      meeting: m,
      roles: m.role_claims.filter((c) => c.member_id === memberId).map((c) => c.role_key),
    }))
    .filter((x) => x.roles.length > 0)
    .slice(0, limit);
}

// ── Online-only role reservation ─────────────────────────────────────────────
// While a meeting is still further out than `daysBefore` days, its roles are
// held for members who take part online only; from that point on they open to
// everyone. Independent of the rotation rule (consecutiveRoleBlocked), which
// applies in both phases.

export const DEFAULT_RESERVATION_DAYS_BEFORE = 7;

export interface RoleReservation {
  active: boolean;          // reservation currently in effect for this meeting
  opensOn: string;          // YYYY-MM-DD (IST) the roles open to everyone
  opensAt: Date;            // that date at 00:00 IST
  reservedThrough: string;  // YYYY-MM-DD (IST) — last full day still reserved
}

// null when the feature is switched off — callers treat that as "no gate".
export function roleReservation(
  meeting: Meeting,
  enabled: boolean,
  daysBefore: number = DEFAULT_RESERVATION_DAYS_BEFORE,
): RoleReservation | null {
  if (!enabled) return null;
  const [y, mo, d] = meeting.date.split('-').map(Number);
  const open = new Date(Date.UTC(y, mo - 1, d - Math.max(0, daysBefore)));
  // 00:00 IST is 18:30 UTC on the previous day.
  const opensAt = new Date(open.getTime() - (5 * 60 + 30) * 60 * 1000);
  return {
    active: Date.now() < opensAt.getTime(),
    opensOn: open.toISOString().slice(0, 10),
    opensAt,
    // The day before opening — the last date roles are still online-only.
    reservedThrough: new Date(open.getTime() - 86_400_000).toISOString().slice(0, 10),
  };
}

// How far off the opening is, in plain words: "tomorrow", "in 3 days". Because
// opensAt is midnight IST, "less than 24h away" always means the next IST day.
export function reservationCountdown(reservation: RoleReservation): string {
  const ms = reservation.opensAt.getTime() - Date.now();
  if (ms <= 0) return 'now';
  const days = Math.ceil(ms / 86_400_000);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

// Why a member can't claim during the reservation window, or null if they can.
// Online-only members are never blocked by this rule.
export function reservationBlocked(
  mode: ParticipationMode,
  reservation: RoleReservation | null,
): string | null {
  if (!reservation?.active || mode === 'online') return null;
  return `Reserved for online members only till ${formatShortDate(reservation.reservedThrough)}`;
}

// Format "2026-08-09" → "9 Aug"
export function formatShortDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const month = new Date(Date.UTC(y, mo - 1, d))
    .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${d} ${month}`;
}

// IST = UTC+5:30. Meeting deadline is start_time IST on meeting date.
// Roles lock `lockBeforeMins` before start_time IST. start_time stored as "HH:MM:SS".
export function getMeetingDeadlineUTC(meeting: Meeting, lockBeforeMins = 60): Date {
  const [h, m] = meeting.start_time.split(':').map(Number);
  const istOffsetMin = 5 * 60 + 30;
  const utcMinutes = h * 60 + m - istOffsetMin - lockBeforeMins;
  const utcH = Math.floor(((utcMinutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const utcM = ((utcMinutes % 60) + 60) % 60;
  const utcDay = utcMinutes < 0 ? -1 : 0;

  const [year, month, day] = meeting.date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + utcDay, utcH, utcM, 0));
}

export function isMeetingLocked(meeting: Meeting, lockBeforeMins = 60): boolean {
  return Date.now() >= getMeetingDeadlineUTC(meeting, lockBeforeMins).getTime();
}

// Returns the lock time formatted as IST for display.
export function getMeetingLockTimeIST(meeting: Meeting, lockBeforeMins = 60): string {
  const [h, m] = meeting.start_time.split(':').map(Number);
  const total = h * 60 + m - lockBeforeMins;
  const lh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const lm = ((total % 60) + 60) % 60;
  return formatTime(`${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')}:00`);
}


// Meeting becomes "past" once its end_time (IST) has passed on the meeting date.
export function isMeetingPast(meeting: Meeting): boolean {
  const [y, mo, d]  = meeting.date.split('-').map(Number);
  const [h, m]      = meeting.end_time.split(':').map(Number);
  const istOffsetMin = 5 * 60 + 30;
  const utcMinutes  = h * 60 + m - istOffsetMin;
  const utcH  = Math.floor(((utcMinutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const utcM  = ((utcMinutes % 60) + 60) % 60;
  const utcDay = utcMinutes < 0 ? -1 : 0;
  return Date.now() >= new Date(Date.UTC(y, mo - 1, d + utcDay, utcH, utcM, 0)).getTime();
}

// True when every role slot in the meeting has been claimed.
export function areAllRolesFilled(meeting: MeetingWithClaims): boolean {
  const claimed = new Set(meeting.role_claims.map((c) => `${c.role_key}:${c.slot_index}`));
  return getMeetingRoles(meeting).every(({ roleKey, slot }) => claimed.has(`${roleKey}:${slot}`));
}

// Format as ordinal: 3 → "3rd", 21 → "21st"
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Format "2026-05-03" → "Sunday, 3rd May"
export function formatMeetingDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  // Use UTC to avoid timezone shifts on the date itself
  const date = new Date(Date.UTC(y, mo - 1, d));
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${weekday}, ${ordinal(d)} ${month}`;
}

// Format "13:00:00" → "1:00 PM", "10:45:00" → "10:45 AM"
export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Build the WhatsApp agenda text from a meeting + members index
// Allotted time (minutes) for a prepared speech. A per-speech override wins;
// otherwise falls back to the level-based default (L1 is shorter than L2–5).
export function speechTimeRange(
  claim: { speech_level: number | null; speech_min_mins: number | null; speech_max_mins: number | null } | null | undefined,
  l1Max = 6,
  otherMax = 7,
): { min: number; max: number } {
  const isL1 = claim?.speech_level === 1;
  return {
    min: claim?.speech_min_mins ?? (isL1 ? 4 : 5),
    max: claim?.speech_max_mins ?? (isL1 ? l1Max : otherMax),
  };
}

export function buildWhatsAppAgenda(
  meeting: MeetingWithClaims,
  membersById: Map<string, Member>,
  includeIntros = true,
  lockBeforeMins = 60,
  baseUrl: string = APP_URL,
  // Active online-only reservation window, if any — adds a note so the group
  // knows why roles look open but aren't claimable by everyone yet.
  reservation: RoleReservation | null = null,
): string {
  // Build links off wherever the app is actually running (passed in by the
  // client), falling back to the canonical URL for server-side callers.
  const base = baseUrl.replace(/\/+$/, '');
  const timerUrl = `${base}/timer`;
  const getClaimName = (roleKey: RoleKey, slot: number): string => {
    const claim = meeting.role_claims.find(
      (c) => c.role_key === roleKey && c.slot_index === slot
    );
    if (!claim) return '';
    const m = membersById.get(claim.member_id);
    return m ? `TM ${m.display_name}` : '';
  };

  // Only invite people to claim roles while there's still an open slot and the
  // meeting hasn't locked — otherwise the call-to-action is pointless noise.
  const rolesOpen = !areAllRolesFilled(meeting) && !isMeetingLocked(meeting, lockBeforeMins);

  const lines: string[] = [];

  const reserved = rolesOpen && !!reservation?.active;

  const special = meeting.is_special_session === true;

  if (rolesOpen) {
    lines.push(special
      ? 'Please come forward to take the roles in this special session:'
      : 'Please come forward to take the roles in the next meeting:');
    if (reserved && reservation) {
      lines.push('');
      // WhatsApp has no underline — bold+italic is the strongest emphasis available.
      // Naming both dates avoids the "until Wednesday" ambiguity (roles open *on*
      // that day, so the last reserved day is the one before).
      lines.push(`🌐 *Roles are reserved for members who attend online only* till *_${formatMeetingDate(reservation.reservedThrough)}_* — on *_${formatMeetingDate(reservation.opensOn)}_* the roles will open to all to claim.`);
    }
    lines.push('');
  }
  lines.push(`Dehradun Online Toastmasters Meeting #${meeting.number}`);
  // A special session leads with its own banner so it doesn't read as a routine
  // meeting. The theme doubles as the session title, and the note is admin-
  // written so the wording stays theirs.
  const specialName = special ? specialSessionName(meeting) : null;
  if (special) {
    lines.push(`✨ *SPECIAL SESSION${specialName ? `: ${specialName}` : ''}* ✨`);
    const note = meeting.special_session_note?.trim();
    if (note) lines.push(`_${note}_`);
  }
  lines.push('');
  lines.push('Speak, Lead, Inspire');
  lines.push('');
  lines.push(
    `🗓️ ${formatMeetingDate(meeting.date)}, ${formatTime(meeting.start_time)}- ${formatTime(meeting.end_time)} IST`
  );
  // Skipped when the special-session banner already carried the theme as its title.
  if (meeting.theme && !specialName) {
    lines.push('');
    lines.push(`🌐 Theme: ${meeting.theme}`);
  }
  lines.push('');
  lines.push(meeting.meeting_link ? `🔗 Meeting link: ${meeting.meeting_link}` : '🔗 Meeting link: To be set');
  lines.push('');

  // Evaluator for a speaker slot: the assigned member, or "Assignment in
  // progress" while a speaker-nominated evaluator awaits officer approval,
  // otherwise blank (open).
  const evaluatorForSpeaker = (slot: number): string => {
    const name = getClaimName('evaluator', slot);
    if (name) return name;
    const pending = (meeting.evaluator_requests ?? []).some(
      (r) => r.status === 'pending' && r.speaker_slot_index === slot,
    );
    return pending ? '⏳ Assignment in progress' : '';
  };

  // One speaker block: bold-keyed Speaker / (speech details) / Time / Evaluator,
  // then a blank line for spacing between speakers.
  const pushSpeakerLines = (slot: number, indexLabel: string) => {
    lines.push(` ${indexLabel}. *Speaker*: ${getClaimName('speaker', slot)}`);
    const claim = meeting.role_claims.find((c) => c.role_key === 'speaker' && c.slot_index === slot);
    if (claim) {
      if (claim.path)         lines.push(`    *Path*: ${claim.path}`);
      if (claim.speech_level) lines.push(`    *Level*: ${claim.speech_level}`);
      if (claim.project)      lines.push(`    *Project*: ${claim.project}`);
      if (claim.speech_title) lines.push(`    *Title*: "${claim.speech_title}"`);
      const { min, max } = speechTimeRange(claim);
      lines.push(`    *Time*: ${min}–${max} min`);
    }
    if (isRoleEnabled(meeting, 'evaluator') && slot <= meeting.evaluator_slots) {
      lines.push(`    *Evaluator*: ${evaluatorForSpeaker(slot)}`);
    }
    lines.push('');
  };

  const grouped = hasSpeakerGroups(meeting);

  // Prepared Speakers — grouped by heat (in speaking order) for a speakathon,
  // otherwise a flat 1..N list. Each evaluator pairs inline with its speaker.
  if (isRoleEnabled(meeting, 'speaker')) {
    if (grouped) {
      lines.push('🎙️ Prepared Speeches (by group):');
      for (const bucket of speakerBuckets(meeting)) {
        if (bucket.slots.length === 0) continue;
        lines.push(`*${bucket.group ? bucket.group.name : 'Unassigned'}*`);
        let n = 0;
        for (const slot of bucket.slots) {
          n += 1;
          pushSpeakerLines(slot, String(n));
        }
      }
    } else {
      lines.push(isRoleEnabled(meeting, 'evaluator') ? '🎙️ Prepared Speakers and Evaluators:' : '🎙️ Prepared Speakers:');
      for (let i = 1; i <= meeting.speaker_slots; i++) pushSpeakerLines(i, String(i));
    }
  }

  // Evaluators without a paired speaker (extra eval slots, or speakers disabled)
  // — normal pairs are already listed inline with the speaker above.
  if (!grouped && isRoleEnabled(meeting, 'evaluator')) {
    const pairedMax = isRoleEnabled(meeting, 'speaker') ? meeting.speaker_slots : 0;
    if (meeting.evaluator_slots > pairedMax) {
      lines.push('⚖️ Evaluators:');
      for (let i = pairedMax + 1; i <= meeting.evaluator_slots; i++) {
        lines.push(` ${i}. ${getClaimName('evaluator', i)}`);
      }
      lines.push('');
    }
  }

  // Jury (speakathon judges)
  if ((meeting.jury_slots ?? 0) > 0) {
    lines.push('🧑‍⚖️ Jury:');
    for (let i = 1; i <= meeting.jury_slots; i++) {
      lines.push(` ${i}. ${getClaimName('jury', i)}`);
    }
    lines.push('');
  }

  // Main Roles
  lines.push('Main Roles:');
  if (isRoleEnabled(meeting, 'tmod')) lines.push(`🎤 *TMoD*: ${getClaimName('tmod', 1)}`);
  if (isRoleEnabled(meeting, 'ttm'))  lines.push(`💬 *TTM*: ${getClaimName('ttm', 1)}`);
  if (isRoleEnabled(meeting, 'ge'))   lines.push(`📋 *GE*: ${getClaimName('ge', 1)}`);
  lines.push('');

  // Auxiliary Roles — sequence: Timer, Ah-Counter, Grammarian, Harkmaster.
  lines.push('Auxiliary Roles:');
  if (isRoleEnabled(meeting, 'timer'))      lines.push(`⌛️ *Timer*: ${getClaimName('timer', 1)}`);
  if (isRoleEnabled(meeting, 'ah_counter')) lines.push(`🔍 *Ah-Counter*: ${getClaimName('ah_counter', 1)}`);
  if (isRoleEnabled(meeting, 'grammarian')) lines.push(`📚 *Grammarian*: ${getClaimName('grammarian', 1)}`);
  if (isRoleEnabled(meeting, 'harkmaster')) lines.push(`👂 *Harkmaster*: ${getClaimName('harkmaster', 1)}`);

  lines.push('');
  lines.push(`⏱️ Speech Timer (use during the meeting): ${timerUrl}`);

  if (rolesOpen) {
    lines.push('');
    lines.push(`Claim your role on the app: ${base}/`);
    if (reserved) {
      lines.push('');
      lines.push('ℹ️ _Would you still like a role while slots are reserved for our online-only members? You\'re very welcome to ask in the app - VP Education will review it accordingly_');
    }
  }

  // Introductions section — grouped by heat for a speakathon.
  const introBlocks = buildRolePlayerBlocks(meeting, membersById);

  if (includeIntros && introBlocks.length > 0) {
    lines.push('');
    lines.push('─────────────────────────');
    lines.push('📋 Role Player Introductions:');
    lines.push('');
    lines.push(...introBlocks);
  }

  return lines.join('\n');
}

export function buildWhatsAppIntros(
  meeting: MeetingWithClaims,
  membersById: Map<string, Member>
): string {
  const lines: string[] = [];
  lines.push('📋 Role Player Introductions:');
  lines.push(`Dehradun Online Toastmasters Meeting #${meeting.number}`);
  lines.push('');
  lines.push(...buildRolePlayerBlocks(meeting, membersById));
  return lines.join('\n');
}

// ── Agenda builder ──────────────────────────────────────────────────────────

export interface AgendaRow {
  timeLabel: string;
  indented: boolean;
  label: string;
  // '' = role slot exists but unclaimed (show "TM ___________")
  // string = claimed (show "TM <name>" in maroon)
  // undefined = no role associated with this row (show nothing)
  name?: string;
  suffix?: string;   // plain text rendered after name (supports mid-sentence placement)
  name2?: string;    // second highlighted name rendered after suffix
  duration?: string;
  note?: string;
}

export interface AgendaSection {
  num: number;
  title: string;
  rows: AgendaRow[];
}

export interface AgendaConfig {
  l1SpeechMins: number;
  otherSpeechMins: number;
  ttSpeakerCountMin: number;
  ttSpeakerCountMax: number;
  ttMinsPerSpeaker: number;
  tmodConclusionMins: number;
  lockBeforeMins: number;
  maxSpeakerSlots: number;
}

export const DEFAULT_AGENDA_CONFIG: AgendaConfig = {
  l1SpeechMins: 6,
  otherSpeechMins: 7,
  ttSpeakerCountMin: 4,
  ttSpeakerCountMax: 5,
  ttMinsPerSpeaker: 2,
  tmodConclusionMins: 5,
  lockBeforeMins: 60,
  maxSpeakerSlots: 2,
};

export function buildAgendaSections(
  meeting: MeetingWithClaims,
  membersById: Map<string, Member>,
  config: AgendaConfig = DEFAULT_AGENDA_CONFIG
): AgendaSection[] {
  // `offset` is shared via closure — always read before advancing with `offset +=`
  let offset = 0;

  function timeAt(): string {
    const [h, m] = meeting.start_time.split(':').map(Number);
    const total = h * 60 + m + offset;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    const ampm = nh >= 12 ? 'PM' : 'AM';
    const h12 = nh % 12 || 12;
    return `${h12}:${String(nm).padStart(2, '0')} ${ampm}`;
  }

  // Returns display_name if the slot is claimed, '' if unclaimed (slot exists but nobody signed up)
  function getName(key: RoleKey, slot = 1): string {
    const claim = meeting.role_claims.find(
      (c) => c.role_key === key && c.slot_index === slot
    );
    return claim ? (membersById.get(claim.member_id)?.display_name ?? '') : '';
  }

  // Returns display_name of a member holding a given leadership role, '' if none
  function getLeader(role: LeadershipRole): string {
    for (const m of membersById.values()) {
      if (hasLeadershipRole(m, role)) return m.display_name;
    }
    return '';
  }

  function r(
    indented: boolean,
    label: string,
    name?: string,
    duration?: string,
    note?: string,
    suffix?: string,
    name2?: string,
  ): AgendaRow {
    return { timeLabel: timeAt(), indented, label, name, suffix, name2, duration, note };
  }

  // ── Section 1: Opening ───────────────────────────────────────────────────
  const s1: AgendaRow[] = [];

  const presN = getLeader('president');

  s1.push(r(false, 'Sergeant-at-Arms calls the meeting to order'));                              offset += 5;
  s1.push(r(false, 'Sergeant-at-Arms calls the Chair (President', presN,
    undefined, undefined, ') for opening remarks'));                                             offset += 5;
  s1.push(r(false, 'Chair (President', presN,
    undefined, undefined, ') calls the Toastmaster of the Day', getName('tmod')));               offset += 1;
  s1.push(r(false, 'TMoD', getName('tmod'),
    undefined, meeting.theme || 'Theme introduction', ' opens & introduces the theme'));         offset += 3;
  s1.push(r(false, 'TMoD', getName('tmod'),
    undefined, undefined, ' calls the General Evaluator', getName('ge')));                       offset += 1;
  const openingRoles = ([
    { key: 'timer'      as RoleKey, roleLabel: 'Timer',      note: undefined as string | undefined },
    { key: 'ah_counter' as RoleKey, roleLabel: 'Ah-Counter', note: undefined },
    { key: 'grammarian' as RoleKey, roleLabel: 'Grammarian', note: 'Introduces the Word of the Day & Idiom of the Day' },
    { key: 'harkmaster' as RoleKey, roleLabel: 'Harkmaster', note: undefined },
  ]).filter((rr) => isRoleEnabled(meeting, rr.key));

  if (openingRoles.length > 0) {
    s1.push(r(false, 'General Evaluator', getName('ge'),
      undefined, undefined, ' calls the role players one by one:'));

    for (const { key, roleLabel, note } of openingRoles) {
      s1.push(r(true, roleLabel, getName(key), '2–3 MIN', note, ' comes up & explains the role')); offset += 3;
    }
  }

  s1.push(r(false, 'General Evaluator', getName('ge'),
    undefined, undefined, ' hands the meeting back to the Toastmaster of the Day'));             offset += 1;
  s1.push(r(false, 'TMoD', getName('tmod'),
    undefined, undefined, ' builds on the theme, then introduces the prepared speeches'));       offset += 3;

  // ── Section 2: Prepared Speeches ─────────────────────────────────────────
  const s2speeches: AgendaRow[] = [];

  // Speakers are walked by heat and in speaking order (numbered per group); a
  // grouped speakathon gets a heading row before each group's speeches.
  const grouped = hasSpeakerGroups(meeting);
  if (isRoleEnabled(meeting, 'speaker')) {
    for (const bucket of speakerBuckets(meeting)) {
      if (bucket.slots.length === 0) continue;
      if (grouped) {
        s2speeches.push(r(false, `▸ ${bucket.group ? bucket.group.name : 'Unassigned'}`));
      }
      let n = 0;
      for (const slot of bucket.slots) {
        n += 1;
        s2speeches.push(r(false, 'TMoD', getName('tmod'), '1 MIN',
          "Shares the speaker's project & evaluation criteria", ` calls Evaluator ${n}`, getName('evaluator', slot))); offset += 1;

        const spkClaim = meeting.role_claims.find(
          (c) => c.role_key === 'speaker' && c.slot_index === slot
        );
        const spkName  = spkClaim ? (membersById.get(spkClaim.member_id)?.display_name ?? '') : '';
        const { min: spkMin, max: spkMax } = speechTimeRange(spkClaim, config.l1SpeechMins, config.otherSpeechMins);
        const durLabel = `${spkMin}–${spkMax} MIN`;
        const spkMins  = spkMax;

        let spkNote: string | undefined;
        if (spkClaim) {
          const meta: string[] = [];
          if (spkClaim.path)         meta.push(spkClaim.path);
          if (spkClaim.speech_level) meta.push(`L${spkClaim.speech_level}`);
          if (spkClaim.project)      meta.push(spkClaim.project);
          const metaStr = meta.join(' · ');
          if (spkClaim.speech_title && metaStr) spkNote = `"${spkClaim.speech_title}" — ${metaStr}`;
          else if (spkClaim.speech_title)       spkNote = `"${spkClaim.speech_title}"`;
          else if (metaStr)                     spkNote = metaStr;
        }

        s2speeches.push(r(false, 'TMoD', getName('tmod'), durLabel, spkNote, ` calls Speaker ${n}`, spkName)); offset += spkMins;
      }
    }
  }

  // ── Section 2: Table Topics ───────────────────────────────────────────────
  const s2: AgendaRow[] = [];
  if (isRoleEnabled(meeting, 'ttm')) {
    const ttLabel = `${config.ttSpeakerCountMin}–${config.ttSpeakerCountMax} SPEAKERS · 1–${config.ttMinsPerSpeaker}½ MIN EACH`;
    s2.push(r(false, 'TMoD', getName('tmod'),
      undefined, undefined, ' carries the theme forward, then calls the Table Topics Master', getName('ttm'))); offset += 2;
    s2.push(r(false, 'Table Topics Master', getName('ttm'),
      ttLabel, 'Impromptu speaking for guests & members', ' conducts the session'));             offset += config.ttSpeakerCountMax * config.ttMinsPerSpeaker;
    s2.push(r(false, 'Table Topics Master', getName('ttm'),
      undefined, undefined, ' hands back to the Toastmaster of the Day'));                       offset += 1;
    s2.push(r(false, 'TMoD', getName('tmod'),
      undefined, undefined, ' speaks more on the theme'));                                       offset += 2;
  }

  // ── Section 3: Evaluations ────────────────────────────────────────────────
  const s3: AgendaRow[] = [];
  s3.push(r(false, 'TMoD', getName('tmod'),
    undefined, undefined, ' calls the General Evaluator', getName('ge')));                       offset += 1;
  if (isRoleEnabled(meeting, 'evaluator')) {
    s3.push(r(false, 'General Evaluator', getName('ge'),
      undefined, undefined, ' calls the evaluators one by one:'));

    for (let i = 1; i <= meeting.evaluator_slots; i++) {
      s3.push(r(true, `Evaluator ${i}`, getName('evaluator', i), '2–3 MIN', undefined,
        ' delivers the evaluation'));                                                             offset += 3;
    }
  }

  const reportRoles = ([
    { key: 'timer'      as RoleKey, roleLabel: 'Timer'      },
    { key: 'ah_counter' as RoleKey, roleLabel: 'Ah-Counter' },
    { key: 'grammarian' as RoleKey, roleLabel: 'Grammarian' },
    { key: 'harkmaster' as RoleKey, roleLabel: 'Harkmaster' },
  ]).filter((rr) => isRoleEnabled(meeting, rr.key));
  if (reportRoles.length > 0) {
    s3.push(r(false, 'General Evaluator', getName('ge'),
      undefined, undefined, " calls the role players' reports:"));
    for (const { key, roleLabel } of reportRoles) {
      s3.push(r(true, roleLabel, getName(key), '1–2 MIN', undefined, ' delivers the report'));   offset += 2;
    }
  }

  s3.push(r(false, 'General Evaluator', getName('ge'),
    undefined, undefined, ' gives the general evaluation, then hands back to the TMoD'));        offset += 3;

  // ── Section 5: Closing ────────────────────────────────────────────────────
  const s5: AgendaRow[] = [];
  s5.push(r(false, 'TMoD', getName('tmod'),
    `~${config.tmodConclusionMins} MIN`, undefined, ' brings the theme to a conclusion'));       offset += config.tmodConclusionMins;
  s5.push(r(false, 'TMoD', getName('tmod'),
    undefined, undefined, ' hands the meeting back to the Chair'));                              offset += 1;
  s5.push(r(false, 'Chair (President', getLeader('president'),
    undefined, 'Guests share their experience of the meeting',
    ') invites the guests to introduce themselves'));                                             offset += 3;
  s5.push(r(false, 'Chair (President', getLeader('president'),
    undefined, undefined, ') shares awards, announcements & closing remarks'));

  return [
    { title: 'Opening',           rows: s1 },
    { title: 'Prepared Speeches', rows: s2speeches },
    { title: 'Table Topics',      rows: s2 },
    { title: 'Evaluations',       rows: s3 },
    { title: 'Closing',           rows: s5 },
  ]
    .filter((s) => s.rows.length > 0)
    .map((s, i) => ({ ...s, num: i + 1 }));
}
