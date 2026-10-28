import { addressOf, calendarInvitation, escapeText, foldLine, icsTime } from './ics.js';

const event = {
  method: 'REQUEST' as const,
  uid: '7b0c-interview@goodpeople.local',
  sequence: 2,
  stamp: new Date('2026-10-28T09:15:30.123Z'),
  start: new Date('2026-10-29T04:00:00Z'),
  end: new Date('2026-10-29T04:30:00Z'),
  summary: 'Interview: Sewing Machine Operator, My Group',
  description: 'Bring your NID card.\nAsk for HR at the gate; parking, if any, is outside.',
  location: 'Gazipur factory, HR room',
  organizer: { name: 'My Group', email: 'no-reply@goodpeople.local' },
  attendees: [
    { name: 'Nusrat "Nu" Jahan', email: 'nusrat@example.com' },
    { name: 'Shirin Akter', email: 'shirin@my-group.test' },
  ],
};

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('calendar invitations', () => {
  it('writes times in UTC with a stamp', () => {
    expect(icsTime(new Date('2026-10-29T04:00:00.000Z'))).toBe('20261029T040000Z');
    const ics = unfold(calendarInvitation(event));
    expect(ics).toContain('DTSTART:20261029T040000Z\r\n');
    expect(ics).toContain('DTEND:20261029T043000Z\r\n');
    expect(ics).toContain('DTSTAMP:20261028T091530Z\r\n');
  });

  it('carries the method, UID, sequence, organizer and every attendee', () => {
    const ics = unfold(calendarInvitation(event));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('METHOD:REQUEST\r\n');
    expect(ics).toContain('UID:7b0c-interview@goodpeople.local\r\n');
    expect(ics).toContain('SEQUENCE:2\r\n');
    expect(ics).toContain('STATUS:CONFIRMED\r\n');
    expect(ics).toContain('ORGANIZER;CN="My Group":mailto:no-reply@goodpeople.local\r\n');
    // A double quote cannot appear inside a quoted parameter, so it is dropped.
    expect(ics).toContain('ATTENDEE;CN="Nusrat Nu Jahan";ROLE=REQ-PARTICIPANT');
    expect(ics).toContain(':mailto:shirin@my-group.test\r\n');
  });

  it('cancels with the same UID', () => {
    const ics = unfold(calendarInvitation({ ...event, method: 'CANCEL', sequence: 3 }));
    expect(ics).toContain('METHOD:CANCEL\r\n');
    expect(ics).toContain('STATUS:CANCELLED\r\n');
    expect(ics).toContain('SEQUENCE:3\r\n');
    expect(ics).toContain('UID:7b0c-interview@goodpeople.local\r\n');
  });

  it('escapes text values', () => {
    expect(escapeText('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf');
    const ics = unfold(calendarInvitation(event));
    expect(ics).toContain('LOCATION:Gazipur factory\\, HR room\r\n');
    expect(ics).toContain(
      'DESCRIPTION:Bring your NID card.\\nAsk for HR at the gate\\; parking\\, if any\\, is outside.\r\n',
    );
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const ascii = 'SUMMARY:' + 'x'.repeat(200);
    const folded = foldLine(ascii);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(Buffer.byteLength(lines[0]!)).toBe(75);
    for (const line of lines.slice(1)) {
      expect(line.startsWith(' ')).toBe(true);
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(ascii);

    // Bangla is three octets a character: no line may end inside one.
    const bangla = 'SUMMARY:সাক্ষাৎকার: সেলাই মেশিন অপারেটর, মাই গ্রুপ, গাজীপুর কারখানা';
    const parts = foldLine(bangla).split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
      expect(Buffer.from(part).toString('utf8')).not.toContain('�');
    }
    expect(parts.join('\r\n').replace(/\r\n /g, '')).toBe(bangla);

    const ics = calendarInvitation({ ...event, summary: 'x'.repeat(300) });
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it('reads the address from the sending name', () => {
    expect(addressOf('Good People <no-reply@goodpeople.local>')).toBe('no-reply@goodpeople.local');
    expect(addressOf('hr@example.com')).toBe('hr@example.com');
  });
});
