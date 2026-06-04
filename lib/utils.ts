import type { Meeting, MeetingWithClaims, Member, RoleKey } from './types';
import { ROLE_META } from './types';

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
// start_time stored as "HH:MM:SS".
export function getMeetingDeadlineUTC(meeting: Meeting): Date {
  const [h, m] = meeting.start_time.split(':').map(Number);
  const istOffsetMin = 5 * 60 + 30;
  // Convert HH:MM IST to UTC minutes
  const utcMinutes = h * 60 + m - istOffsetMin;
  const utcH = Math.floor(((utcMinutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const utcM = ((utcMinutes % 60) + 60) % 60;
  const utcDay = utcMinutes < 0 ? -1 : 0; // previous UTC day if IST crosses midnight

  const [year, month, day] = meeting.date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + utcDay, utcH, utcM, 0));
}

export function isMeetingLocked(meeting: Meeting): boolean {
  return Date.now() >= getMeetingDeadlineUTC(meeting).getTime();
}

// Meeting becomes "past" at 2 PM IST on its own date (2 PM IST = 08:30 UTC).
// This lets the next meeting surface as "Upcoming" right after the current one ends.
export function isMeetingPast(meeting: Meeting): boolean {
  const [y, m, d] = meeting.date.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d, 8, 30, 0));
  return Date.now() >= cutoff.getTime();
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
export function buildWhatsAppAgenda(
  meeting: MeetingWithClaims,
  membersById: Map<string, Member>
): string {
  const getClaimName = (roleKey: RoleKey, slot: number): string => {
    const claim = meeting.role_claims.find(
      (c) => c.role_key === roleKey && c.slot_index === slot
    );
    if (!claim) return '';
    const m = membersById.get(claim.member_id);
    return m ? `TM ${m.display_name}` : '';
  };

  const lines: string[] = [];

  lines.push('Please come forward to take the roles in the next meeting:');
  lines.push(`Dehradun Online Toastmasters Meeting #${meeting.number}`);
  lines.push('Speak, Lead, Inspire');
  lines.push(
    `🗓️ ${formatMeetingDate(meeting.date)}, ${formatTime(meeting.start_time)}- ${formatTime(meeting.end_time)} IST`
  );
  if (meeting.theme) lines.push(`🌐 Theme: ${meeting.theme}`);
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
      if (details.length > 0) lines.push(`    ${details.join(' | ')}`);
    }
  }
  lines.push('');

  // Evaluators
  lines.push('⚖️Evaluators:');
  for (let i = 1; i <= meeting.evaluator_slots; i++) {
    const name = getClaimName('evaluator', i);
    lines.push(` ${i}. ${name}`);
  }
  lines.push('');
  lines.push('');

  // Main Roles
  lines.push('Main Roles:');
  lines.push(`🎤 TMoD- ${getClaimName('tmod', 1)}`);
  if (meeting.meeting_type !== 'speakathon') {
    lines.push(`💬 TTM- ${getClaimName('ttm', 1)}`);
  }
  lines.push(`📋 GE- ${getClaimName('ge', 1)}`);

  // Auxiliary Roles
  lines.push('Auxiliary Roles:');
  lines.push(`📚 Grammarian- ${getClaimName('grammarian', 1)}`);
  lines.push(`🔍 Ah-Counter- ${getClaimName('ah_counter', 1)}`);
  lines.push(`⌛️ Timer- ${getClaimName('timer', 1)}`);
  lines.push(`👂 Harkmaster- ${getClaimName('harkmaster', 1)}`);

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

  if (introBlocks.length > 0) {
    lines.push('');
    lines.push('─────────────────────────');
    lines.push('📋 Role Player Introductions:');
    lines.push('');
    lines.push(...introBlocks);
  }

  return lines.join('\n');
}
