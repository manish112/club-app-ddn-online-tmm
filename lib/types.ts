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
  | 'harkmaster';

export type MeetingType = 'regular' | 'speakathon';

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
  { label: string; emoji: string; section: 'speaker' | 'evaluator' | 'main' | 'tag' }
> = {
  speaker:    { label: 'Prepared Speaker', emoji: '🎙️', section: 'speaker' },
  evaluator:  { label: 'Evaluator',        emoji: '⚖️',  section: 'evaluator' },
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

// Ordered role slots for a meeting — TTM excluded when speakathon
export function getMeetingRoles(meeting: Meeting): { roleKey: RoleKey; slot: number }[] {
  const roles: { roleKey: RoleKey; slot: number }[] = [];

  for (let i = 1; i <= meeting.speaker_slots; i++) {
    roles.push({ roleKey: 'speaker', slot: i });
  }
  for (let i = 1; i <= meeting.evaluator_slots; i++) {
    roles.push({ roleKey: 'evaluator', slot: i });
  }

  const singleRoles: RoleKey[] =
    meeting.meeting_type === 'speakathon'
      ? ['tmod', 'ge', 'grammarian', 'ah_counter', 'timer', 'harkmaster']
      : ['tmod', 'ttm', 'ge', 'grammarian', 'ah_counter', 'timer', 'harkmaster'];

  for (const roleKey of singleRoles) {
    roles.push({ roleKey, slot: 1 });
  }

  return roles;
}
