export type BallotStatus = 'not_started' | 'open' | 'closed';

export interface TTSpeaker {
  id: string;        // member UUID, or "guest-{timestamp}" for guests
  name: string;      // display_name for members, entered name for guests
  is_guest: boolean;
}

export interface Ballot {
  id: string;
  meeting_id: string;
  status: BallotStatus;
  meeting_code: string | null;
  voter_count: number | null;
  table_topics_speakers: TTSpeaker[];
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface VoteResult {
  category: string;
  voted_for_member_id: string | null;
  voted_for_display_name: string;
  vote_count: number;
}

export type RoleKey =
  | 'speaker'
  | 'evaluator'
  | 'tmod'
  | 'ttm'
  | 'ge'
  | 'grammarian'
  | 'ah_counter'
  | 'timer'
  | 'harkmaster'
  | 'jury';

// Roles that only an admin may fill — members never see a claim affordance.
export const ASSIGN_ONLY_ROLES: RoleKey[] = ['jury'];

export type MeetingType = 'regular' | 'speakathon';

// A named speaker group (heat) within a speakathon. `id` is a stable client-
// generated string so renaming a group doesn't break the pair→group mapping.
export interface SpeakerGroup {
  id: string;
  name: string;
}

export type LeadershipRole = 'president' | 'vp_education' | 'vp_membership' | 'secretary' | 'vp_pr' | 'club_mentor';

export const LEADERSHIP_ROLES: { value: LeadershipRole; label: string; exclusive: boolean }[] = [
  { value: 'president',     label: 'Club President',      exclusive: true  },
  { value: 'vp_education',  label: 'VP Education',         exclusive: true  },
  { value: 'vp_membership', label: 'VP Membership',        exclusive: true  },
  { value: 'secretary',     label: 'Secretary',            exclusive: true  },
  { value: 'vp_pr',         label: 'VP Public Relations',  exclusive: true  },
  { value: 'club_mentor',   label: 'Club Mentor',          exclusive: false },
];

export interface Member {
  id: string;
  membership_no: string;
  name: string;
  display_name: string;
  active: boolean;
  is_admin: boolean;
  can_manage_guests: boolean;
  introduction: string | null;
  mentor_id: string | null;
  leadership_role: LeadershipRole | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  gender: 'male' | 'female' | 'other' | null;
  avatar_url: string | null;
  show_phone_in_contact: boolean;
  theme_preference: 'dark' | 'light' | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  number: number;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM:SS
  end_time: string;    // HH:MM:SS
  theme: string | null;
  meeting_type: MeetingType;
  speaker_slots: number;
  evaluator_slots: number;
  disabled_roles: RoleKey[];   // role categories turned off for this meeting
  // Speakathon extras (0 / empty for regular meetings)
  jury_slots: number;                    // admin-assigned judges; jury shown when > 0
  speaker_groups: SpeakerGroup[];        // named heats
  pair_groups: Record<string, string>;   // speaker slot_index → group id
  pair_order: number[];                  // speaking order of speaker slots
  contest_locked: boolean;               // when true, jury scoring is locked
  contest_reset_locked: boolean;         // when true, the reset-scores action is disabled
  created_at: string;
}

export interface RoleClaim {
  id: string;
  meeting_id: string;
  role_key: RoleKey;
  slot_index: number;   // always ≥ 1; single-slot roles use 1
  member_id: string;
  claimed_at: string;
  admin_override: boolean;
  // Speaker-only fields (Pathways speech details)
  path: string | null;
  speech_level: number | null;
  project: string | null;
  speech_title: string | null;
  // Allotted speech time in minutes; null falls back to the level-based default.
  speech_min_mins: number | null;
  speech_max_mins: number | null;
  member?: Member | null;
}

// Toastmasters Pathways learning paths
export const PATHS = [
  'Dynamic Leadership',
  'Effective Coaching',
  'Engaging Humor',
  'Innovative Planning',
  'Leadership Development',
  'Motivational Strategies',
  'Persuasive Influence',
  'Presentation Mastery',
  'Strategic Relationships',
  'Team Collaboration',
  'Visionary Communication',
] as const;

export type Path = (typeof PATHS)[number];
export const LEVELS = [1, 2, 3, 4, 5] as const;

export interface MeetingWithClaims extends Meeting {
  role_claims: RoleClaim[];
}

export const ROLE_META: Record<
  RoleKey,
  { label: string; emoji: string; section: 'speaker' | 'evaluator' | 'main' | 'tag' | 'jury' }
> = {
  speaker:    { label: 'Prepared Speaker', emoji: '🎙️', section: 'speaker' },
  evaluator:  { label: 'Evaluator',        emoji: '⚖️',  section: 'evaluator' },
  jury:       { label: 'Jury',             emoji: '🧑‍⚖️', section: 'jury' },
  tmod:       { label: 'TMoD',             emoji: '🎤',  section: 'main' },
  ttm:        { label: 'TTM',              emoji: '💬',  section: 'main' },
  ge:         { label: 'GE',               emoji: '📋',  section: 'main' },
  grammarian: { label: 'Grammarian',       emoji: '📚',  section: 'tag' },
  ah_counter: { label: 'Ah-Counter',       emoji: '🔍',  section: 'tag' },
  timer:      { label: 'Timer',            emoji: '⌛️',  section: 'tag' },
  harkmaster: { label: 'Harkmaster',       emoji: '👂',  section: 'tag' },
};

export interface GuestRegistration {
  id: string;
  meeting_id: string | null;
  name: string | null;
  phone: string;
  email: string;
  registration_type: 'attendance' | 'inquiry';
  converted_to_member: boolean;
  converted_at: string | null;
  created_at: string;
}

export interface SpeakerSlotRequest {
  id: string;
  meeting_id: string;
  member_id: string;
  status: 'pending' | 'approved' | 'denied';
  request_note: string | null;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// One jury member's 8-item rubric ballot for one contestant (speakathon contest).
export interface JuryScore {
  id: string;
  meeting_id: string;
  judge_member_id: string;
  contestant_member_id: string;
  scores: Record<string, number>;   // rubric item key → points
  total: number;
  updated_at: string;
  created_at: string;
}

// Admin-computed result per contestant: per-item averages, final score, rank & reveal flag.
export interface ContestResult {
  id: string;
  meeting_id: string;
  contestant_member_id: string;
  item_avgs: Record<string, number>;
  final_score: number;
  rank: number | null;
  judge_count: number;
  revealed: boolean;
  computed_at: string;
}

export interface Announcement {
  id: string;
  message: string;
  active: boolean;
  created_at: string;
}

// App-usage tracking row (device_captures). Written server-side by /api/capture.
export interface DeviceCapture {
  id: string;
  visitor_id: string | null;
  member_id: string | null;
  ip: string | null;
  user_agent: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  device_type: string | null;
  device_vendor: string | null;
  device_model: string | null;
  screen: string | null;
  timezone: string | null;
  languages: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  path: string | null;
  created_at: string;
}

// Client-collected signals POSTed to /api/capture (server adds IP + UA parse + geo).
export interface CaptureClientSignals {
  visitorId?: string | null;
  memberId?: string | null;
  screen?: string | null;
  timezone?: string | null;
  languages?: string | null;
  path?: string | null;
}

// Whether a role category is active for a meeting. A role can be turned off via
// the per-meeting `disabled_roles` list; legacy speakathon meetings always have
// Table Topics (ttm) off even if their disabled_roles wasn't backfilled.
export function isRoleEnabled(meeting: Meeting, roleKey: RoleKey): boolean {
  if (meeting.disabled_roles?.includes(roleKey)) return false;
  if (roleKey === 'ttm' && meeting.meeting_type === 'speakathon') return false;
  return true;
}

// Ordered role slots for a meeting — excludes any disabled category.
export function getMeetingRoles(meeting: Meeting): { roleKey: RoleKey; slot: number }[] {
  const roles: { roleKey: RoleKey; slot: number }[] = [];

  if (isRoleEnabled(meeting, 'speaker')) {
    for (let i = 1; i <= meeting.speaker_slots; i++) {
      roles.push({ roleKey: 'speaker', slot: i });
    }
  }
  if (isRoleEnabled(meeting, 'evaluator')) {
    for (let i = 1; i <= meeting.evaluator_slots; i++) {
      roles.push({ roleKey: 'evaluator', slot: i });
    }
  }

  // Jury is admin-assigned only and lives outside the disabled-roles model; it
  // appears whenever the meeting has been given jury seats.
  for (let i = 1; i <= (meeting.jury_slots ?? 0); i++) {
    roles.push({ roleKey: 'jury', slot: i });
  }

  const singleRoles: RoleKey[] = ['tmod', 'ttm', 'ge', 'grammarian', 'ah_counter', 'timer', 'harkmaster'];
  for (const roleKey of singleRoles) {
    if (isRoleEnabled(meeting, roleKey)) roles.push({ roleKey, slot: 1 });
  }

  return roles;
}
