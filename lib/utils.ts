import type { Meeting, MeetingWithClaims, Member, RoleKey } from './types';
import { ROLE_META, getMeetingRoles } from './types';

// Public app URL used in call-to-action prompts (e.g. WhatsApp agenda).
export const APP_URL = 'https://dehradun-online-tm.vercel.app/';

const TAG_ROLES: RoleKey[] = ['grammarian', 'ah_counter', 'timer', 'harkmaster'];

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
  lockBeforeMins = 60
): string {
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

  if (rolesOpen) {
    lines.push('Please come forward to take the roles in the next meeting:');
    lines.push('');
  }
  lines.push(`Dehradun Online Toastmasters Meeting #${meeting.number}`);
  lines.push('');
  lines.push('Speak, Lead, Inspire');
  lines.push('');
  lines.push(
    `🗓️ ${formatMeetingDate(meeting.date)}, ${formatTime(meeting.start_time)}- ${formatTime(meeting.end_time)} IST`
  );
  if (meeting.theme) {
    lines.push('');
    lines.push(`🌐 Theme: ${meeting.theme}`);
  }
  lines.push('');

  // Prepared Speakers
  lines.push('🎙️ Prepared Speakers:');
  for (let i = 1; i <= meeting.speaker_slots; i++) {
    const claim = meeting.role_claims.find((c) => c.role_key === 'speaker' && c.slot_index === i);
    const name = claim ? (membersById.get(claim.member_id) ? `TM ${membersById.get(claim.member_id)!.display_name}` : '') : '';
    lines.push(` ${i}. ${name}`);
    if (claim) {
      const details: string[] = [];
      if (claim.path)         details.push(`Path: ${claim.path}`);
      if (claim.speech_level) details.push(`Level ${claim.speech_level}`);
      if (claim.project)      details.push(`Project: ${claim.project}`);
      if (claim.speech_title) details.push(`Title: "${claim.speech_title}"`);
      const { min: tMin, max: tMax } = speechTimeRange(claim);
      details.push(`Time: ${tMin}–${tMax} min`);
      if (details.length > 0) lines.push(`    ${details.join(' | ')}`);
    }
  }
  lines.push('');

  // Evaluators
  lines.push('⚖️ Evaluators:');
  for (let i = 1; i <= meeting.evaluator_slots; i++) {
    const name = getClaimName('evaluator', i);
    lines.push(` ${i}. ${name}`);
  }
  lines.push('');

  // Main Roles
  lines.push('Main Roles:');
  lines.push(`🎤 TMoD- ${getClaimName('tmod', 1)}`);
  if (meeting.meeting_type !== 'speakathon') {
    lines.push(`💬 TTM- ${getClaimName('ttm', 1)}`);
  }
  lines.push(`📋 GE- ${getClaimName('ge', 1)}`);
  lines.push('');

  // Auxiliary Roles
  lines.push('Auxiliary Roles:');
  lines.push(`📚 Grammarian- ${getClaimName('grammarian', 1)}`);
  lines.push(`🔍 Ah-Counter- ${getClaimName('ah_counter', 1)}`);
  lines.push(`⌛️ Timer- ${getClaimName('timer', 1)}`);
  lines.push(`👂 Harkmaster- ${getClaimName('harkmaster', 1)}`);

  if (rolesOpen) {
    lines.push('');
    lines.push(`Claim your role on the app: ${APP_URL}`);
  }

  // Introductions section
  const roleOrder: { key: RoleKey; slots: number }[] = [
    { key: 'speaker',    slots: meeting.speaker_slots },
    { key: 'evaluator',  slots: meeting.evaluator_slots },
    { key: 'tmod',       slots: 1 },
    ...(meeting.meeting_type !== 'speakathon' ? [{ key: 'ttm' as RoleKey, slots: 1 }] : []),
    { key: 'ge',         slots: 1 },
    { key: 'grammarian', slots: 1 },
    { key: 'ah_counter', slots: 1 },
    { key: 'timer',      slots: 1 },
    { key: 'harkmaster', slots: 1 },
  ];

  const introBlocks: string[] = [];
  for (const { key, slots } of roleOrder) {
    const meta = ROLE_META[key];
    for (let slot = 1; slot <= slots; slot++) {
      const claim = meeting.role_claims.find((c) => c.role_key === key && c.slot_index === slot);
      if (!claim) continue;
      const member = membersById.get(claim.member_id);
      if (!member) continue;

      const label = slots > 1
        ? `${meta.emoji} ${meta.label} ${slot} – TM ${member.display_name}`
        : `${meta.emoji} ${meta.label} – TM ${member.display_name}`;
      introBlocks.push(label);

      if (member.introduction) introBlocks.push(member.introduction);
      introBlocks.push('');
    }
  }

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
  const roleOrder: { key: RoleKey; slots: number }[] = [
    { key: 'speaker',    slots: meeting.speaker_slots },
    { key: 'evaluator',  slots: meeting.evaluator_slots },
    { key: 'tmod',       slots: 1 },
    ...(meeting.meeting_type !== 'speakathon' ? [{ key: 'ttm' as RoleKey, slots: 1 }] : []),
    { key: 'ge',         slots: 1 },
    { key: 'grammarian', slots: 1 },
    { key: 'ah_counter', slots: 1 },
    { key: 'timer',      slots: 1 },
    { key: 'harkmaster', slots: 1 },
  ];

  const lines: string[] = [];
  lines.push('📋 Role Player Introductions:');
  lines.push(`Dehradun Online Toastmasters Meeting #${meeting.number}`);
  lines.push('');

  for (const { key, slots } of roleOrder) {
    const meta = ROLE_META[key];
    for (let slot = 1; slot <= slots; slot++) {
      const claim = meeting.role_claims.find((c) => c.role_key === key && c.slot_index === slot);
      if (!claim) continue;
      const member = membersById.get(claim.member_id);
      if (!member) continue;

      const label = slots > 1
        ? `${meta.emoji} ${meta.label} ${slot} – TM ${member.display_name}`
        : `${meta.emoji} ${meta.label} – TM ${member.display_name}`;
      lines.push(label);
      if (member.introduction) lines.push(member.introduction);
      lines.push('');
    }
  }

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
}

export const DEFAULT_AGENDA_CONFIG: AgendaConfig = {
  l1SpeechMins: 6,
  otherSpeechMins: 7,
  ttSpeakerCountMin: 4,
  ttSpeakerCountMax: 5,
  ttMinsPerSpeaker: 2,
  tmodConclusionMins: 5,
  lockBeforeMins: 60,
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

  // Returns display_name of the member with a given leadership_role, '' if not found
  function getLeader(role: string): string {
    for (const m of membersById.values()) {
      if (m.leadership_role === role) return m.display_name;
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
  s1.push(r(false, 'General Evaluator', getName('ge'),
    undefined, undefined, ' calls the role players one by one:'));

  for (const { key, roleLabel, note } of [
    { key: 'timer'      as RoleKey, roleLabel: 'Timer',      note: undefined as string | undefined },
    { key: 'ah_counter' as RoleKey, roleLabel: 'Ah-Counter', note: undefined },
    { key: 'grammarian' as RoleKey, roleLabel: 'Grammarian', note: 'Introduces the Word of the Day & Idiom of the Day' },
    { key: 'harkmaster' as RoleKey, roleLabel: 'Harkmaster', note: undefined },
  ]) {
    s1.push(r(true, roleLabel, getName(key), '2–3 MIN', note, ' comes up & explains the role')); offset += 3;
  }

  s1.push(r(false, 'General Evaluator', getName('ge'),
    undefined, undefined, ' hands the meeting back to the Toastmaster of the Day'));             offset += 1;
  s1.push(r(false, 'TMoD', getName('tmod'),
    undefined, undefined, ' builds on the theme, then introduces the prepared speeches'));       offset += 3;

  // ── Section 2: Prepared Speeches ─────────────────────────────────────────
  const s2speeches: AgendaRow[] = [];

  for (let i = 1; i <= meeting.speaker_slots; i++) {
    s2speeches.push(r(false, 'TMoD', getName('tmod'), '1 MIN',
      "Shares the speaker's project & evaluation criteria", ` calls Evaluator ${i}`, getName('evaluator', i))); offset += 1;

    const spkClaim = meeting.role_claims.find(
      (c) => c.role_key === 'speaker' && c.slot_index === i
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

    s2speeches.push(r(false, 'TMoD', getName('tmod'), durLabel, spkNote, ` calls Speaker ${i}`, spkName)); offset += spkMins;
  }

  // ── Section 2: Table Topics ───────────────────────────────────────────────
  const s2: AgendaRow[] = [];
  if (meeting.meeting_type !== 'speakathon') {
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
  s3.push(r(false, 'General Evaluator', getName('ge'),
    undefined, undefined, ' calls the evaluators one by one:'));

  for (let i = 1; i <= meeting.evaluator_slots; i++) {
    s3.push(r(true, `Evaluator ${i}`, getName('evaluator', i), '2–3 MIN', undefined,
      ' delivers the evaluation'));                                                               offset += 3;
  }

  s3.push(r(false, 'General Evaluator', getName('ge'),
    undefined, undefined, " calls the role players' reports:"));
  for (const { key, roleLabel } of [
    { key: 'timer'      as RoleKey, roleLabel: 'Timer'      },
    { key: 'ah_counter' as RoleKey, roleLabel: 'Ah-Counter' },
    { key: 'grammarian' as RoleKey, roleLabel: 'Grammarian' },
    { key: 'harkmaster' as RoleKey, roleLabel: 'Harkmaster' },
  ]) {
    s3.push(r(true, roleLabel, getName(key), '1–2 MIN', undefined, ' delivers the report'));     offset += 2;
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
