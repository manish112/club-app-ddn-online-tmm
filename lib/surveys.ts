// Single source of truth for the Toastmasters Item 403 survey questions.
// Shared by the member-facing forms, the read-only response view, and the admin
// panel so the wording never drifts.

export const INTEREST_LEVELS = [
  { value: 'high', label: 'High Interest' },
  { value: 'some', label: 'Some Interest' },
  { value: 'none', label: 'No Interest' },
] as const;

export const SATISFACTION_LEVELS = [
  { value: 'extremely',  label: 'Extremely Satisfied' },
  { value: 'very',       label: 'Very Satisfied' },
  { value: 'moderately', label: 'Moderately Satisfied' },
  { value: 'slightly',   label: 'Slightly Satisfied' },
  { value: 'not',        label: 'Not Satisfied' },
] as const;

export interface InterestItem {
  key: string;
  label: string;
  textField?: string; // extra "if so, …" free-text prompt for this item
}

export interface InterestGroup {
  title: string;
  items: InterestItem[];
}

// ── Member Interest Survey (PDF page 1) ─────────────────────────────────────
export const INTEREST_GROUPS: InterestGroup[] = [
  {
    title: 'Personal and Vocational',
    items: [
      { key: 'pv_critical',      label: 'Improve critical-thinking skills' },
      { key: 'pv_meeting',       label: 'Improve meeting-management skills' },
      { key: 'pv_listening',     label: 'Improve listening skills' },
      { key: 'pv_leadership',    label: 'Improve leadership skills',    textField: 'If so, what?' },
      { key: 'pv_communication', label: 'Improve communication skills', textField: 'If so, what?' },
      { key: 'pv_evaluation',    label: 'Improve evaluation skills' },
    ],
  },
  {
    title: 'Club Involvement',
    items: [
      { key: 'ci_mentor',        label: 'Serve as a mentor for a new member' },
      { key: 'ci_membership',    label: 'Help increase club membership' },
      { key: 'ci_officer',       label: 'Serve as a club officer', textField: 'If so, which role?' },
      { key: 'ci_pr',            label: 'Help the club with public relations or publicity' },
      { key: 'ci_newsletter',    label: 'Contribute to or edit the club newsletter or website' },
      { key: 'ci_parliamentary', label: 'Learn about parliamentary procedure' },
    ],
  },
  {
    title: 'Outside the Club',
    items: [
      { key: 'oc_speechcraft',     label: 'Lead or help with a Speechcraft program' },
      { key: 'oc_youthleadership', label: 'Lead or help with a Youth Leadership program' },
      { key: 'oc_youthmodule',     label: 'Lead or help with a youth communication module' },
      { key: 'oc_visit',           label: 'Visit other Toastmasters clubs' },
      { key: 'oc_compete',         label: 'Compete in a speech contest' },
    ],
  },
  {
    title: 'Within the District',
    items: [
      { key: 'wd_judge',    label: 'Judge a speech contest' },
      { key: 'wd_organize', label: 'Organize a new Toastmasters club' },
      { key: 'wd_leader',   label: 'Serve as a district leader', textField: 'If so, which office?' },
      { key: 'wd_other',    label: 'Other', textField: 'Specify' },
    ],
  },
];

// ── Club Survey (PDF page 2) ────────────────────────────────────────────────
export const QUALITY_CHARACTERISTICS: { key: string; label: string }[] = [
  { key: 'q_welcoming',        label: 'Welcoming' },
  { key: 'q_friendly',         label: 'Friendly/relaxed atmosphere' },
  { key: 'q_positive',         label: 'Positive/Supportive' },
  { key: 'q_organized',        label: 'Organized meetings' },
  { key: 'q_leaders',          label: 'Supportive club leaders' },
  { key: 'q_participate',      label: 'Opportunities to participate' },
  { key: 'q_tabletopics',      label: 'Creative Table Topics' },
  { key: 'q_evaluations',      label: 'Effective evaluations' },
  { key: 'q_development',      label: 'Provides professional development' },
  { key: 'q_networking',       label: 'A networking environment' },
  { key: 'q_promotion',        label: 'Promotion of club in the community' },
  { key: 'q_varied',           label: 'Varied and fun meetings' },
  { key: 'q_sponsoring',       label: 'Toastmasters sponsoring new members recognized' },
  { key: 'q_memberceremony',   label: 'Member achievements formally recognized with ceremony' },
  { key: 'q_publicized',       label: 'Club and member achievements publicized' },
];

export const OVERALL_EXPERIENCE: { key: string; label: string }[] = [
  { key: 'like_most',       label: 'What do you like most about your club?' },
  { key: 'like_least',      label: 'What do you like least about your club?' },
  { key: 'recommendations', label: 'What recommendations for improvement can you provide?' },
  { key: 'learn_more',      label: 'Is there anything more specific you would like to learn about?' },
];

// ── Response shapes (stored as jsonb) ───────────────────────────────────────
export interface MemberInterestResponses {
  goals: string[];       // 2 entries
  objectives: string[];  // 2 entries
  interests: Record<string, string>;  // item key → interest level value
  texts: Record<string, string>;      // item key → "if so" free text
}

export interface ClubSurveyResponses {
  quality: Record<string, string>;    // characteristic key → satisfaction value
  like_most: string;
  like_least: string;
  recommendations: string;
  learn_more: string;
}

export const interestLevelLabel = (v: string) =>
  INTEREST_LEVELS.find((l) => l.value === v)?.label ?? '—';
export const satisfactionLabel = (v: string) =>
  SATISFACTION_LEVELS.find((l) => l.value === v)?.label ?? '—';
