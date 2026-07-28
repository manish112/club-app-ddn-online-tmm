// Build an iCalendar (.ics) meeting invite (METHOD:REQUEST) so email clients
// show an "Add to calendar / RSVP" affordance and Gmail auto-adds the event.
// No Google Calendar API / OAuth needed — this is a standard iMIP invite.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface IcsMeeting {
  id: string;
  number: number;
  date: string;        // YYYY-MM-DD (IST wall-clock)
  start_time: string;  // HH:MM[:SS]
  end_time: string;    // HH:MM[:SS]
  theme?: string | null;
  meeting_link?: string | null;
}

// IST wall-clock date+time → UTC "YYYYMMDDTHHMMSSZ".
function toIcsUtc(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`;
}

function nowIcsUtc(): string {
  const dt = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}${p(dt.getUTCSeconds())}Z`;
}

const esc = (s: string) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildMeetingIcs(
  m: IcsMeeting,
  attendee: { name: string; email: string } | null,
  organizer: { name: string; email: string },
): string {
  const theme = m.theme && m.theme !== 'TBD' ? m.theme : '';
  const summary = `Toastmasters Meeting #${m.number}${theme ? ` — ${theme}` : ''}`;
  const location = m.meeting_link || 'Online';
  const descParts = [`Dehradun Online Toastmasters — Meeting #${m.number}`];
  if (theme) descParts.push(`Theme: ${theme}`);
  if (m.meeting_link) descParts.push(`Join: ${m.meeting_link}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dehradun Online Toastmasters//Club App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:meeting-${m.id}@ddntm`,
    'SEQUENCE:0',
    `DTSTAMP:${nowIcsUtc()}`,
    `DTSTART:${toIcsUtc(m.date, m.start_time)}`,
    `DTEND:${toIcsUtc(m.date, m.end_time)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(descParts.join('\n'))}`,
    `LOCATION:${esc(location)}`,
    `ORGANIZER;CN=${esc(organizer.name)}:mailto:${organizer.email}`,
  ];
  if (attendee) {
    lines.push(`ATTENDEE;CN=${esc(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`);
  }
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
