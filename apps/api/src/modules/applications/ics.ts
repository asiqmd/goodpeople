// Calendar invitations (iCalendar, RFC 5545, sent as iTIP, RFC 5546): one event per interview,
// whose UID stays the same and whose SEQUENCE goes up with every change, so mail clients
// replace the event they added before, or remove it when it is cancelled.

export interface CalendarPerson {
  name: string;
  email: string;
}

export interface CalendarEvent {
  method: 'REQUEST' | 'CANCEL';
  uid: string;
  sequence: number;
  /** When this version of the event was made. */
  stamp: Date;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: CalendarPerson;
  attendees: CalendarPerson[];
}

/** UTC as RFC 5545 writes it: 20261029T040000Z. */
export const icsTime = (date: Date) =>
  date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');

/** TEXT values: backslash, semicolon and comma escaped, line breaks as \n (s.3.3.11). */
export const escapeText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/** A parameter value, always quoted; it cannot hold a double quote or control characters. */
const paramValue = (value: string) =>
  // oxlint-disable-next-line no-control-regex -- control characters cannot appear in a parameter
  `"${value.replace(/["\u0000-\u001f\u007f]/g, '')}"`;

/**
 * Folds a content line longer than 75 octets: CRLF and a space before each continuation
 * (s.3.1), never inside a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    // The first line holds 75 octets; continuations 74 after their leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const mailto = (email: string) => `mailto:${email}`;

/** The invitation, or its cancellation, as an iCalendar object with CRLF line endings. */
export function calendarInvitation(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Good People//Recruitment//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${icsTime(event.stamp)}`,
    `DTSTART:${icsTime(event.start)}`,
    `DTEND:${icsTime(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `STATUS:${event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    `ORGANIZER;CN=${paramValue(event.organizer.name)}:${mailto(event.organizer.email)}`,
    ...event.attendees.map(
      (a) =>
        `ATTENDEE;CN=${paramValue(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:${mailto(a.email)}`,
    ),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** The address in "Name <address>" or a bare address. */
export function addressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}
