// Built-in default WhatsApp message templates. Deliberately short: WhatsApp is
// a nudge, not a newsletter — the email covers the detail, and every one of
// these ends with a link back to the app.
//
// Each body is plain text with {{placeholders}} named after our variables. In
// template mode those placeholders are replaced by Meta's positional {{1}},
// {{2}}… parameters, in the order given by PARAM_VARS (or by the order they
// appear in the body when an admin hasn't set an order).

export type WaTemplateKey =
  | 'welcome'
  | 'meeting_created'
  | 'role_assigned'
  | 'role_removed'
  | 'role_reminder'
  | 'no_role_nudge'
  | 'meeting_starting';

export const WA_TEMPLATE_KEYS: WaTemplateKey[] = [
  'welcome',
  'meeting_created',
  'role_assigned',
  'role_removed',
  'role_reminder',
  'no_role_nudge',
  'meeting_starting',
];

// The messages an admin can fire by hand from the panel. `role_removed` isn't
// among them: a removal only means anything to the one person it happened to,
// so there is nothing sensible to broadcast.
export const WA_MANUAL_SEND_KEYS: WaTemplateKey[] = [
  'welcome',
  'meeting_created',
  'role_assigned',
  'role_reminder',
  'no_role_nudge',
  'meeting_starting',
];

// Messages that aren't about a particular meeting, so a manual send doesn't
// need one scheduled.
export const WA_MEETINGLESS_KEYS: WaTemplateKey[] = ['welcome'];

export const WA_TEMPLATE_LABELS: Record<WaTemplateKey, string> = {
  welcome:          'Welcome / introducing WhatsApp (to a member)',
  meeting_created:  'New meeting announced (to all members)',
  role_assigned:    'Role assigned (to the member)',
  role_removed:     'Role removed (to the member)',
  role_reminder:    'Role reminder — 1 day before (to each role holder)',
  no_role_nudge:    'Pick a role — 1 day before (to members without one)',
  meeting_starting: 'Starting soon — meeting day, with the full role sheet',
};

export const WA_TEMPLATE_HINTS: Record<WaTemplateKey, string> = {
  welcome:          'Sent when a member is added, and sendable to the whole club to introduce the channel.',
  meeting_created:  'Fires when an admin announces a newly created meeting.',
  role_assigned:    'Fires the moment a role is claimed or assigned, whoever did it.',
  role_removed:     'Fires when a role is released or removed by an admin.',
  role_reminder:    'Fires the day before, once per role a member holds.',
  no_role_nudge:    'Fires the day before, only to members with no role at that meeting, and only while roles are still open.',
  meeting_starting: 'Fires on meeting day, within the lead-time window set above. Lists who has which role and what is still vacant.',
};

// Every placeholder a kind may use. The admin editor lists these, and the
// parameter order must be drawn from them.
const COMMON = ['full_name', 'club_name', 'app_url', 'vp_education_name'];

export const WA_PLACEHOLDERS: Record<WaTemplateKey, string[]> = {
  welcome:          [...COMMON],
  meeting_created:  [...COMMON, 'meeting_number', 'meeting_date', 'meeting_time', 'meeting_theme'],
  role_assigned:    [...COMMON, 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'actor_line'],
  role_removed:     [...COMMON, 'meeting_number', 'meeting_date', 'meeting_time', 'role_label', 'actor_line'],
  role_reminder:    [...COMMON, 'meeting_number', 'meeting_date', 'meeting_time', 'role_label'],
  no_role_nudge:    [...COMMON, 'meeting_number', 'meeting_date', 'meeting_time', 'open_roles_count', 'open_roles_list'],
  meeting_starting: [...COMMON, 'meeting_number', 'meeting_start', 'meeting_time', 'meeting_theme', 'meeting_link', 'roles_taken', 'roles_open'],
};

// The order our variables map onto Meta's positional body parameters, for each
// body's own placeholders — matching the order they appear in it, so a template
// submitted verbatim from the admin panel lines up with no further configuration.
// The sign-off's parameters are appended below.
const BODY_PARAM_VARS: Record<WaTemplateKey, string[]> = {
  welcome:          ['full_name', 'vp_education_name', 'app_url'],
  meeting_created:  ['full_name', 'meeting_number', 'meeting_date', 'meeting_time', 'meeting_theme', 'app_url'],
  role_assigned:    ['full_name', 'role_label', 'meeting_number', 'meeting_date', 'meeting_time', 'actor_line', 'app_url'],
  role_removed:     ['full_name', 'role_label', 'meeting_number', 'meeting_date', 'actor_line', 'app_url'],
  role_reminder:    ['full_name', 'role_label', 'meeting_number', 'meeting_date', 'meeting_time', 'app_url'],
  no_role_nudge:    ['full_name', 'meeting_number', 'meeting_date', 'open_roles_count', 'open_roles_list', 'app_url'],
  meeting_starting: ['full_name', 'meeting_number', 'meeting_start', 'roles_taken', 'roles_open', 'meeting_link'],
};

// Every message signs off from the VP Education, by name. The name is a
// parameter so it follows whoever holds the office; the title and club line are
// fixed text, which keeps the parameter count down and the sign-off constant.
//
// The closing note is not decoration. Nothing reads replies to this number — a
// member answering "sorry, can't make it" would be talking to nobody — so every
// message says so, and each one points at somewhere that is read: the app, or
// the VP Education by name just above.
const SIGN_OFF =
  '\n\nRegards,\n{{vp_education_name}}\nVP Education\nDehradun Online Toastmasters Club'
  + '\n\n_Please do not reply to this number — it is not monitored. Do reach out to '
  + 'TM {{vp_education_name}} instead._';

// The sign-off's own placeholders, in the order they appear in it. Derived from
// SIGN_OFF rather than typed out, so editing the sign-off can't leave the
// parameter lists a variable short — which Meta would reject at send time, on
// every template at once.
const SIGN_OFF_PARAM_VARS: string[] =
  [...SIGN_OFF.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);

// Meta rejects a body parameter containing a newline, a tab, or more than four
// consecutive spaces, and rejects an empty one outright — so every variable
// above must resolve to a single, non-empty line.
//
// That constraint is why the layout is built the way it is: headings, blank
// lines and emoji all live in the fixed body, where line breaks are allowed,
// and a variable-length list arrives as one parameter with its items separated
// by " · ". A list can't be given a line per item without baking the club's
// exact role set into the template and re-approving it whenever slots change.
//
// *Single asterisks* are WhatsApp's bold syntax and render as bold on the phone.
const BODIES: Record<WaTemplateKey, string> = {
  welcome:
    'Dear TM {{full_name}} 👋\n\n'
    + 'This is your *Dehradun Online Toastmasters* club system.\n\n'
    + 'From here on I will drop you a line on WhatsApp now and then — when a new meeting is '
    + 'announced, when a role comes your way or leaves it, a nudge the day before, and a hello '
    + 'on meeting day.\n\n'
    + 'That is the whole list. I will not crowd your phone, and I will only nudge when it '
    + 'actually helps.\n\n'
    + 'Would rather not? Have a word with TM {{vp_education_name}}, or switch it off in your '
    + 'profile:\n{{app_url}}\n\n'
    + 'See you at the lectern 🎤',

  meeting_created:
    'Dear TM {{full_name}} 👋\n\n'
    + '📅 *Meeting #{{meeting_number}}* is on the calendar!\n\n'
    + '🗓 {{meeting_date}}\n'
    + '⏰ {{meeting_time}} IST\n'
    + '💡 Theme: {{meeting_theme}}\n\n'
    + 'The role sheet is open — first come, first served.\n'
    + 'Pick yours here:\n{{app_url}}',

  // Both role messages lead with a labelled "Assigned role" / "Role removed"
  // line rather than burying the role in a sentence. It is the one thing the
  // member is opening the message to find out, and a label survives being read
  // at a glance on a lock screen in a way prose does not.
  role_assigned:
    'Dear TM {{full_name}} 🎉\n\n'
    + 'Good news — you are on the agenda!\n\n'
    + '🎯 Assigned role: *{{role_label}}*\n'
    + '📅 Meeting #{{meeting_number}} · {{meeting_date}}\n'
    + '⏰ {{meeting_time}} IST\n\n'
    + '{{actor_line}}\n\n'
    + 'Everything you need to prepare is here:\n{{app_url}}',

  role_removed:
    'Dear TM {{full_name}} 👋\n\n'
    + 'Just a quick update — this role is no longer yours.\n\n'
    + '↩️ Role removed: *{{role_label}}*\n'
    + '📅 Meeting #{{meeting_number}} · {{meeting_date}}\n\n'
    + '{{actor_line}}\n\n'
    + 'No trouble at all — the slot is open again, and there are other roles waiting '
    + 'whenever you are ready:\n{{app_url}}',

  role_reminder:
    'Dear TM {{full_name}} 👋\n\n'
    + 'Tomorrow is the day, and you are our *{{role_label}}*.\n\n'
    + '📅 Meeting #{{meeting_number}} · {{meeting_date}}\n'
    + '⏰ {{meeting_time}} IST\n\n'
    + 'A few minutes of prep goes a long way:\n{{app_url}}\n\n'
    + 'See you there 🎤',

  no_role_nudge:
    'Dear TM {{full_name}} 👋\n\n'
    + '*Meeting #{{meeting_number}}* is tomorrow, {{meeting_date}} — and your name is not on '
    + 'the agenda yet.\n\n'
    + '🙌 *{{open_roles_count}} roles still open*\n'
    + '{{open_roles_list}}\n\n'
    + 'Every one of them is a chance to grow. Claim yours in a tap:\n{{app_url}}',

  meeting_starting:
    'Dear TM {{full_name}} 👋\n\n'
    + '🎤 *Meeting #{{meeting_number}}* starts at {{meeting_start}} IST today!\n\n'
    + '📋 *Roles taken*\n'
    + '{{roles_taken}}\n\n'
    + '🙌 *Still open*\n'
    + '{{roles_open}}\n\n'
    + '🔗 Join us here:\n{{meeting_link}}\n\n'
    + 'See you in a bit!',
};

export const WA_DEFAULT_TEMPLATES: Record<WaTemplateKey, string> = Object.fromEntries(
  WA_TEMPLATE_KEYS.map((key) => [key, BODIES[key] + SIGN_OFF]),
) as Record<WaTemplateKey, string>;

export const WA_PARAM_VARS: Record<WaTemplateKey, string[]> = Object.fromEntries(
  WA_TEMPLATE_KEYS.map((key) => [key, [...BODY_PARAM_VARS[key], ...SIGN_OFF_PARAM_VARS]]),
) as Record<WaTemplateKey, string[]>;

export function waDefaultBody(key: WaTemplateKey): string {
  return WA_DEFAULT_TEMPLATES[key];
}
