// Built-in default email templates. Each `body_html` is a full standalone HTML
// document with {{placeholders}}. Admins may override subject/body per key in
// the email_templates table; empty overrides fall back to these defaults.

export type TemplateKey =
  | 'meeting_created'
  | 'role_assigned'
  | 'role_removed'
  | 'role_reminder'
  | 'meeting_reminder'
  | 'meeting_reminder_day_before'
  | 'evaluator_request'
  | 'leadership_assigned'
  | 'welcome'
  | 'speaker_slot_received'
  | 'speaker_slot_approved'
  | 'speaker_slot_declined'
  | 'speaker_slot_request'
  | 'role_interest_received'
  | 'role_interest_approved'
  | 'role_interest_declined'
  | 'role_interest_request'
  | 'evaluator_request_received'
  | 'evaluator_request_approved'
  | 'evaluator_request_declined'
  | 'evaluator_nominated'
  | 'meeting_cancelled'
  | 'mentor_assigned_to_mentee'
  | 'mentor_assigned_to_mentor'
  | 'announcement'
  | 'custom_message';

export const TEMPLATE_KEYS: TemplateKey[] = [
  'meeting_created',
  'role_assigned',
  'role_removed',
  'role_reminder',
  'meeting_reminder',
  'meeting_reminder_day_before',
  'evaluator_request',
  'leadership_assigned',
  'welcome',
  'speaker_slot_received',
  'speaker_slot_approved',
  'speaker_slot_declined',
  'speaker_slot_request',
  'role_interest_received',
  'role_interest_approved',
  'role_interest_declined',
  'role_interest_request',
  'evaluator_request_received',
  'evaluator_request_approved',
  'evaluator_request_declined',
  'evaluator_nominated',
  'meeting_cancelled',
  'mentor_assigned_to_mentee',
  'mentor_assigned_to_mentor',
  'announcement',
  'custom_message',
];

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  meeting_created:  'New meeting announced (to all members)',
  role_assigned:    'Role assigned (to the member)',
  role_removed:     'Role removed (to the member)',
  role_reminder:    'Role reminder — 1 day before (to each role holder)',
  meeting_reminder: 'Meeting reminder — 1 hour before (to all members)',
  meeting_reminder_day_before: 'Meeting reminder — 1 day before (to all members)',
  evaluator_request:'Evaluator approval needed (to officers)',
  leadership_assigned: 'Leadership role appointed (to the member)',
  welcome:          'Welcome email (to a newly added member)',
  speaker_slot_received: 'Speaker-slot request received (to requester)',
  speaker_slot_approved: 'Speaker-slot request approved (to requester)',
  speaker_slot_declined: 'Speaker-slot request declined (to requester)',
  speaker_slot_request: 'Speaker-slot approval needed (to officers)',
  role_interest_received: 'Role request received (to requester)',
  role_interest_approved: 'Role request approved (to requester)',
  role_interest_declined: 'Role request declined (to requester)',
  role_interest_request: 'Role request approval needed (to officers)',
  evaluator_request_received: 'Evaluator request received (to requester)',
  evaluator_request_approved: 'Evaluator request approved (to requester)',
  evaluator_request_declined: 'Evaluator request declined (to requester)',
  evaluator_nominated: 'Evaluator nominated (to the requested evaluator)',
  meeting_cancelled: 'Meeting cancelled (to all members)',
  mentor_assigned_to_mentee: 'Mentor assigned — to the mentee (shows mentor bio)',
  mentor_assigned_to_mentor: 'Mentor assigned — to the mentor (shows mentee bio)',
  announcement: 'New announcement (to all members)',
  custom_message: 'Custom message (admin-written, to all members)',
};

// Placeholders available to each template, for the admin editor's help list.
export const PLACEHOLDERS: Record<TemplateKey, string[]> = {
  meeting_created:  ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'meeting_theme', 'meeting_link_block', 'roles_summary'],
  role_assigned:    ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'role_emoji', 'actor_line', 'meeting_link_block'],
  role_removed:     ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'role_label', 'role_emoji', 'actor_line'],
  role_reminder:    ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'role_emoji', 'meeting_link_block'],
  meeting_reminder: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'meeting_theme', 'meeting_link_block', 'roles_summary'],
  meeting_reminder_day_before: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'meeting_theme', 'meeting_link_block', 'roles_summary'],
  evaluator_request:['club_name', 'app_url', 'meeting_number', 'meeting_date', 'speaker_name', 'evaluator_name'],
  leadership_assigned:['full_name', 'club_name', 'app_url', 'leadership_role', 'roles_list', 'actor_line'],
  welcome:          ['full_name', 'club_name', 'app_url'],
  speaker_slot_received: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time'],
  speaker_slot_approved: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'review_comment_block'],
  speaker_slot_declined: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'review_comment_block'],
  speaker_slot_request: ['club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'requester_name', 'request_note_block'],
  role_interest_received: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'role_emoji'],
  role_interest_approved: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'role_emoji', 'review_comment_block'],
  role_interest_declined: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'role_emoji', 'review_comment_block'],
  role_interest_request: ['club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'requester_name', 'role_label', 'role_emoji', 'request_note_block'],
  evaluator_request_received: ['full_name', 'evaluator_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time'],
  evaluator_request_approved: ['full_name', 'evaluator_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'review_comment_block'],
  evaluator_request_declined: ['full_name', 'evaluator_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'review_comment_block'],
  evaluator_nominated: ['full_name', 'speaker_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time'],
  meeting_cancelled: ['full_name', 'club_name', 'app_url', 'meeting_number', 'meeting_date', 'meeting_time', 'meeting_theme'],
  mentor_assigned_to_mentee: ['full_name', 'mentor_name', 'mentor_bio_block', 'club_name', 'app_url'],
  mentor_assigned_to_mentor: ['full_name', 'mentee_name', 'mentee_bio_block', 'club_name', 'app_url'],
  announcement: ['full_name', 'club_name', 'app_url', 'message_body'],
  custom_message: ['full_name', 'club_name', 'app_url', 'subject', 'message_body'],
};

const HEADER_GRADIENT = 'linear-gradient(135deg,#6b0c1e 0%,#9d1530 50%,#0E2D6A 100%)';

// Shared HTML shell used by all defaults. `heading` and `body` may contain
// {{placeholders}} which are substituted at render time.
function shell(heading: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${HEADER_GRADIENT};padding:28px 32px;">
            <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{{club_name}}</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${heading}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr><td style="padding-top:18px;border-top:1px solid #eef2f7;">
                <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
                  Regards,<br>
                  <strong style="color:#1e293b;">{{vp_education_name}}</strong><br>
                  VP Education<br>
                  Dehradun Online Toastmasters Club
                </p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              {{club_name}} · Club number: 28680307 · District 224<br>
              You received this because you are a registered Toastmasters member.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const P = 'margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;';
const CARD_OPEN = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f4;border:1.5px solid #f0c5cc;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px 24px;">`;
const CARD_CLOSE = `</td></tr></table>`;
const KICKER = 'margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;';
const CTA = (label: string) =>
  `<a href="{{app_url}}" style="display:inline-block;background:linear-gradient(135deg,#9d1530,#6b0c1e);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">${label}</a>`;

const meetingCard = `${CARD_OPEN}
  <p style="${KICKER}">Meeting</p>
  <p style="margin:0;color:#1e293b;font-size:18px;font-weight:800;">Meeting #{{meeting_number}}</p>
  <p style="margin:4px 0 12px;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
  <p style="${KICKER}">Theme</p>
  <p style="margin:0 0 12px;color:#1e293b;font-size:15px;font-weight:600;">{{meeting_theme}}</p>
  {{meeting_link_block}}
${CARD_CLOSE}`;

// Compact meeting card (no theme/link) for request-status emails.
const requestMeetingCard = `${CARD_OPEN}
  <p style="${KICKER}">Meeting</p>
  <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
  <p style="margin:4px 0 0;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
${CARD_CLOSE}`;

export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; body_html: string }> = {
  meeting_created: {
    subject: 'New meeting scheduled — Meeting #{{meeting_number}}',
    body_html: shell('New Meeting Scheduled', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">A new meeting has been added to the calendar. Claim your role early!</p>
      ${meetingCard}
      {{roles_summary}}
      ${CTA('Claim a Role →')}`),
  },

  role_assigned: {
    subject: '{{role_emoji}} You\'re assigned as {{role_label}} — Meeting #{{meeting_number}}',
    body_html: shell('Role Assigned 🎉', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">You have been assigned the following role for the upcoming meeting.{{actor_line}}</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Your Role</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:800;">{{role_emoji}} {{role_label}}</p>
        <p style="${KICKER}">Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 12px;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
        {{meeting_link_block}}
      ${CARD_CLOSE}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Please prepare accordingly. You can view the full agenda and meeting details in the app.</p>
      ${CTA('Open the App →')}`),
  },

  role_removed: {
    subject: 'Role update: {{role_label}} removed — Meeting #{{meeting_number}}',
    body_html: shell('Role Removed', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Your role for the following meeting has been removed.{{actor_line}}</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Removed Role</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:800;">{{role_emoji}} {{role_label}}</p>
        <p style="${KICKER}">Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:14px;">{{meeting_date}}</p>
      ${CARD_CLOSE}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">If this was unexpected, please check the app or contact your club officer.</p>
      ${CTA('Open the App →')}`),
  },

  role_reminder: {
    subject: '⏰ Reminder: you\'re {{role_label}} tomorrow — Meeting #{{meeting_number}}',
    body_html: shell('Role Reminder ⏰', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">This is a friendly reminder that you are performing the following role at tomorrow's meeting.</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Your Role</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:800;">{{role_emoji}} {{role_label}}</p>
        <p style="${KICKER}">Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 12px;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
        {{meeting_link_block}}
      ${CARD_CLOSE}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Please come prepared. See you there!</p>
      ${CTA('Open the App →')}`),
  },

  meeting_reminder: {
    subject: '🔔 Starting soon — Meeting #{{meeting_number}} in about an hour',
    body_html: shell('Meeting Starting Soon 🔔', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Our meeting begins in about an hour. Here are the details:</p>
      ${meetingCard}
      {{roles_summary}}
      <p style="${P}">See you in the meeting!</p>
      ${CTA('Open the App →')}`),
  },

  speaker_slot_received: {
    subject: 'Request received — extra speaker slot, Meeting #{{meeting_number}}',
    body_html: shell('Request received', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">We've received your request for an extra speaker slot. A club officer will review it shortly.</p>
      ${requestMeetingCard}
      ${CTA('Open the App →')}`),
  },

  speaker_slot_approved: {
    subject: 'Request approved 🎉 — extra speaker slot, Meeting #{{meeting_number}}',
    body_html: shell('Request approved 🎉', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Good news! Your request for an extra speaker slot has been approved — you're now a speaker for the meeting below.</p>
      ${requestMeetingCard}
      {{review_comment_block}}
      ${CTA('Open the App →')}`),
  },

  speaker_slot_declined: {
    subject: 'Request declined — extra speaker slot, Meeting #{{meeting_number}}',
    body_html: shell('Request declined', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Unfortunately your request for an extra speaker slot was not approved this time.</p>
      ${requestMeetingCard}
      {{review_comment_block}}
      ${CTA('Open the App →')}`),
  },

  speaker_slot_request: {
    subject: '🎙️ Speaker-slot approval needed — {{requester_name}}, Meeting #{{meeting_number}}',
    body_html: shell('Speaker Slot Requested 🎙️', `
      <p style="${P}"><strong style="color:#1e293b;">TM {{requester_name}}</strong> has asked for a prepared-speech slot at the meeting below and needs your approval.</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Member</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:800;">🎙️ TM {{requester_name}}</p>
        <p style="${KICKER}">Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
      ${CARD_CLOSE}
      {{request_note_block}}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Open the admin panel to approve or decline. Approving puts them into a free speaker slot, or opens an extra one if the meeting is already full.</p>
      <a href="{{app_url}}/amiadmin" style="display:inline-block;background:linear-gradient(135deg,#9d1530,#6b0c1e);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">Review Request →</a>`),
  },

  role_interest_request: {
    subject: '🙋 Role request — {{requester_name}} wants {{role_label}}, Meeting #{{meeting_number}}',
    body_html: shell('Role Requested 🙋', `
      <p style="${P}"><strong style="color:#1e293b;">TM {{requester_name}}</strong> would like to play a role at the meeting below and needs your approval.</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Requested Role</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:800;">{{role_emoji}} {{role_label}}</p>
        <p style="${KICKER}">Member</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:800;">TM {{requester_name}}</p>
        <p style="${KICKER}">Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
      ${CARD_CLOSE}
      {{request_note_block}}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Approving assigns the role straight away. Declining asks you for a short reason, which is shown to the member.</p>
      <a href="{{app_url}}/amiadmin" style="display:inline-block;background:linear-gradient(135deg,#9d1530,#6b0c1e);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">Review Request →</a>`),
  },

  role_interest_received: {
    subject: 'Request received — {{role_label}}, Meeting #{{meeting_number}}',
    body_html: shell('Request received', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">We've received your request to play <strong style="color:#1e293b;">{{role_emoji}} {{role_label}}</strong> at the meeting below. A club officer will review it shortly and you'll get an email either way.</p>
      ${requestMeetingCard}
      ${CTA('Open the App →')}`),
  },

  role_interest_approved: {
    subject: 'Request approved 🎉 — {{role_label}}, Meeting #{{meeting_number}}',
    body_html: shell('Request approved 🎉', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Good news! You're confirmed as <strong style="color:#1e293b;">{{role_emoji}} {{role_label}}</strong> for the meeting below.</p>
      ${requestMeetingCard}
      {{review_comment_block}}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Please prepare accordingly — the full agenda is in the app.</p>
      ${CTA('Open the App →')}`),
  },

  role_interest_declined: {
    subject: 'Request declined — {{role_label}}, Meeting #{{meeting_number}}',
    body_html: shell('Request declined', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Unfortunately your request to play <strong style="color:#1e293b;">{{role_emoji}} {{role_label}}</strong> was not approved this time.</p>
      ${requestMeetingCard}
      {{review_comment_block}}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Please do come forward for another role — there's usually plenty still open.</p>
      ${CTA('Open the App →')}`),
  },

  evaluator_request_received: {
    subject: 'Evaluator request received — Meeting #{{meeting_number}}',
    body_html: shell('Evaluator request received', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">We've received your request for TM {{evaluator_name}} to evaluate your speech. It's pending officer approval.</p>
      ${requestMeetingCard}
      ${CTA('Open the App →')}`),
  },

  evaluator_request_approved: {
    subject: 'Evaluator approved 🎉 — Meeting #{{meeting_number}}',
    body_html: shell('Evaluator approved 🎉', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">TM {{evaluator_name}} has been approved to evaluate your speech at the meeting below.</p>
      ${requestMeetingCard}
      {{review_comment_block}}
      ${CTA('Open the App →')}`),
  },

  evaluator_request_declined: {
    subject: 'Evaluator request declined — Meeting #{{meeting_number}}',
    body_html: shell('Evaluator request declined', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">TM {{evaluator_name}} was not approved to evaluate your speech for this meeting.</p>
      ${requestMeetingCard}
      {{review_comment_block}}
      ${CTA('Open the App →')}`),
  },

  evaluator_nominated: {
    subject: '⚖️ {{speaker_name}} has requested you as their evaluator — Meeting #{{meeting_number}}',
    body_html: shell('You\'ve been requested as an Evaluator ⚖️', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}"><strong style="color:#1e293b;">TM {{speaker_name}}</strong> has requested you to be their evaluator for the meeting below.</p>
      ${requestMeetingCard}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">The Club VP Education will reach out to you to check whether you can take up this role.</p>
      ${CTA('Open the App →')}`),
  },

  meeting_cancelled: {
    subject: 'Meeting #{{meeting_number}} has been cancelled',
    body_html: shell('Meeting Cancelled', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Please note that the following meeting has been cancelled:</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Cancelled Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:18px;font-weight:800;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 12px;color:#64748b;font-size:14px;">{{meeting_date}} · {{meeting_time}} IST</p>
        <p style="${KICKER}">Theme</p>
        <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">{{meeting_theme}}</p>
      ${CARD_CLOSE}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">We're sorry for any inconvenience. Please watch for the next meeting announcement.</p>
      ${CTA('Open the App →')}`),
  },

  mentor_assigned_to_mentee: {
    subject: '🤝 TM {{mentor_name}} is your new mentor',
    body_html: shell('You have a new mentor 🤝', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}"><strong style="color:#1e293b;">TM {{mentor_name}}</strong> has been assigned as your mentor. They'll guide and support you on your Toastmasters journey — feel free to reach out to them.</p>
      {{mentor_bio_block}}
      ${CTA('Open the App →')}`),
  },

  mentor_assigned_to_mentor: {
    subject: '🤝 You\'re now mentoring TM {{mentee_name}}',
    body_html: shell('You have a new mentee 🤝', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">You have been assigned as a mentor to <strong style="color:#1e293b;">TM {{mentee_name}}</strong>. Please reach out to welcome and support them on their Toastmasters journey.</p>
      {{mentee_bio_block}}
      ${CTA('Open the App →')}`),
  },

  announcement: {
    subject: '📢 New announcement — {{club_name}}',
    body_html: shell('New Announcement 📢', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <div style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px;">{{message_body}}</div>
      ${CTA('Open the App →')}`),
  },

  custom_message: {
    subject: '{{subject}}',
    body_html: shell('{{subject}}', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <div style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px;">{{message_body}}</div>
      ${CTA('Open the App →')}`),
  },

  welcome: {
    subject: '👋 Welcome to {{club_name}}!',
    body_html: shell('Welcome aboard 👋', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Welcome to <strong style="color:#1e293b;">{{club_name}}</strong>! We're delighted to have you with us on your Toastmasters journey of speaking, leading and inspiring.</p>
      <p style="${P}">Use the club app to view upcoming meetings, claim meeting roles, and keep your profile up to date.</p>
      ${CTA('Open the App →')}`),
  },

  leadership_assigned: {
    subject: '🎖️ You\'ve been appointed {{role_label}} — {{club_name}}',
    body_html: shell('Leadership Appointment 🎖️', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">You have been appointed to a club leadership role.{{actor_line}}</p>
      ${CARD_OPEN}
        <p style="${KICKER}">New Role</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:800;">🎖️ {{leadership_role}}</p>
        <p style="${KICKER}">All your leadership roles</p>
        <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">{{roles_list}}</p>
      ${CARD_CLOSE}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Thank you for stepping up to serve the club!</p>
      ${CTA('Open the App →')}`),
  },

  meeting_reminder_day_before: {
    subject: '🔔 Reminder: Meeting #{{meeting_number}} is tomorrow — {{meeting_date}}',
    body_html: shell('Meeting Tomorrow 🔔', `
      <p style="${P}">Dear <strong style="color:#1e293b;">TM {{full_name}}</strong>,</p>
      <p style="${P}">Our next meeting is tomorrow, <strong style="color:#1e293b;">{{meeting_date}}</strong> at {{meeting_time}} IST. Here are the details:</p>
      ${meetingCard}
      {{roles_summary}}
      <p style="${P}">See you in the meeting!</p>
      ${CTA('Open the App →')}`),
  },

  evaluator_request: {
    subject: '⚖️ Evaluator approval needed — {{speaker_name}}, Meeting #{{meeting_number}}',
    body_html: shell('Evaluator Approval Needed ⚖️', `
      <p style="${P}"><strong style="color:#1e293b;">TM {{speaker_name}}</strong> has requested a preferred evaluator for their upcoming speech and needs your approval.</p>
      ${CARD_OPEN}
        <p style="${KICKER}">Speaker</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:800;">🎙️ TM {{speaker_name}}</p>
        <p style="${KICKER}">Requested Evaluator</p>
        <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:800;">⚖️ TM {{evaluator_name}}</p>
        <p style="${KICKER}">Meeting</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #{{meeting_number}}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:14px;">{{meeting_date}}</p>
      ${CARD_CLOSE}
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">Open the admin panel to approve or decline this request. Until it's approved, the evaluator slot is held as &ldquo;assignment in progress&rdquo;.</p>
      <a href="{{app_url}}/amiadmin" style="display:inline-block;background:linear-gradient(135deg,#9d1530,#6b0c1e);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">Review Request →</a>`),
  },
};
