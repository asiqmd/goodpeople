import { describe, expect, it } from 'vitest';
import {
  boundaryOf,
  extractEventJson,
  interpretHikvisionEvent,
  parseMultipart,
  type HikvisionOptions,
} from './hikvision.js';

const options: HikvisionOptions = {
  timeZone: 'Asia/Dhaka',
  eventTypes: new Set([1, 38, 75]),
  remoteIp: '192.168.1.200',
};

function passEvent(overrides: Record<string, unknown> = {}, access: Record<string, unknown> = {}) {
  return {
    ipAddress: '192.168.1.64',
    macAddress: '44:19:B6:AA:BB:CC',
    dateTime: '2026-10-24T08:59:12+06:00',
    eventType: 'AccessControllerEvent',
    eventState: 'active',
    AccessControllerEvent: {
      deviceName: 'Main gate',
      majorEventType: 5,
      subEventType: 75,
      employeeNoString: '1001',
      attendanceStatus: 'checkIn',
      serialNo: 123,
      ...access,
    },
    ...overrides,
  };
}

// A fake JPEG whose bytes include a brace and dashes, to prove picture parts are skipped safely.
const picture = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x7b, 0x2d, 0x2d, 0x0d, 0x0a, 0x00, 0xff, 0xd9,
]);

function multipart(
  boundary: string,
  parts: { headers: string[]; body: Buffer | string }[],
): Buffer {
  const chunks = parts.flatMap((p) => [
    Buffer.from(`--${boundary}\r\n${p.headers.join('\r\n')}\r\n\r\n`),
    Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body),
    Buffer.from('\r\n'),
  ]);
  return Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]);
}

describe('extracting the event JSON', () => {
  it('reads a plain JSON body', () => {
    const body = Buffer.from(JSON.stringify(passEvent()));
    expect(extractEventJson('application/json; charset=UTF-8', body)).toEqual(passEvent());
  });

  it('takes the JSON part of a multipart upload and ignores the picture', () => {
    const body = multipart('MIME_boundary', [
      {
        headers: [
          'Content-Disposition: form-data; name="event_log"',
          'Content-Type: application/json',
        ],
        body: JSON.stringify(passEvent()),
      },
      {
        headers: [
          'Content-Disposition: form-data; name="Picture"; filename="face.jpg"',
          'Content-Type: image/jpeg',
        ],
        body: picture,
      },
    ]);
    expect(extractEventJson('multipart/form-data; boundary=MIME_boundary', body)).toEqual(
      passEvent(),
    );
  });

  it('finds the JSON part wherever it is and whatever it is called', () => {
    const body = multipart('----abc123', [
      { headers: ['Content-Disposition: form-data; name="Picture"'], body: picture },
      {
        headers: ['Content-Disposition: form-data; name="AccessControllerEvent"'],
        body: JSON.stringify(passEvent()),
      },
    ]);
    expect(extractEventJson('multipart/form-data; boundary="----abc123"', body)).toEqual(
      passEvent(),
    );
  });

  it('copes with a multipart body sent under the wrong content type', () => {
    const body = multipart('xyz', [
      {
        headers: ['Content-Disposition: form-data; name="event_log"'],
        body: JSON.stringify(passEvent()),
      },
    ]);
    expect(extractEventJson('application/json', body)).toEqual(passEvent());
    expect(extractEventJson(undefined, body)).toEqual(passEvent());
  });

  it('returns null for bodies with no JSON object', () => {
    expect(extractEventJson('application/json', Buffer.from('not json'))).toBeNull();
    expect(extractEventJson('application/json', Buffer.from('[1,2]'))).toBeNull();
    expect(
      extractEventJson('application/xml', Buffer.from('<EventNotificationAlert/>')),
    ).toBeNull();
    expect(extractEventJson('multipart/form-data; boundary=b', picture)).toBeNull();
  });

  it('splits parts on bytes and survives a truncated upload', () => {
    const full = multipart('b', [
      { headers: ['Content-Disposition: form-data; name="event_log"'], body: '{"a":1}' },
      { headers: ['Content-Type: image/jpeg'], body: picture },
    ]);
    const parts = parseMultipart(full, 'b');
    expect(parts).toHaveLength(2);
    expect(parts[0]?.headers['content-disposition']).toBe('form-data; name="event_log"');
    expect(parts[1]?.body.equals(picture)).toBe(true);
    const truncated = full.subarray(0, full.length - 10);
    expect(extractEventJson('multipart/form-data; boundary=b', truncated)).toEqual({ a: 1 });
    expect(boundaryOf('multipart/form-data;boundary="q r"')).toBe('q r');
  });
});

function direction(attendanceStatus: unknown) {
  const r = interpretHikvisionEvent(passEvent({}, { attendanceStatus }), options);
  return r.kind === 'punch' ? r.punch.direction : r.reason;
}

function at(dateTime: string) {
  const r = interpretHikvisionEvent(passEvent({ dateTime }), options);
  return r.kind === 'punch' ? r.punch.punchedAt : r.reason;
}

function reason(event: unknown) {
  const r = interpretHikvisionEvent(event, options);
  return r.kind === 'ignored' ? r.reason : 'punch';
}

describe('interpreting events', () => {
  it('turns a face pass into a punch keyed by the MAC address', () => {
    expect(interpretHikvisionEvent(passEvent(), options)).toEqual({
      kind: 'punch',
      device: { serialNumber: '44:19:b6:aa:bb:cc', ip: '192.168.1.64' },
      punch: {
        deviceSerial: '44:19:b6:aa:bb:cc',
        vendor: 'hikvision',
        deviceUserId: '1001',
        punchedAt: '2026-10-24T08:59:12+06:00',
        direction: 'in',
      },
    });
  });

  it('maps attendance status to direction', () => {
    expect(
      [
        'checkIn',
        'overtimeIn',
        'checkOut',
        'overtimeOut',
        'breakOut',
        'breakIn',
        'undefined',
        undefined,
      ].map(direction),
    ).toEqual(['in', 'in', 'out', 'out', 'unknown', 'unknown', 'unknown', 'unknown']);
  });

  it('reads a time without an offset as device-zone wall time, and normalises other offsets', () => {
    expect(at('2026-10-24T08:59:12')).toBe('2026-10-24T08:59:12+06:00');
    expect(at('2026-10-24T02:59:12Z')).toBe('2026-10-24T08:59:12+06:00');
    expect(at('2026-10-24T08:59:12+0600')).toBe('2026-10-24T08:59:12+06:00');
    expect(at('soon')).toMatch(/invalid dateTime/);
  });

  it('falls back to the IP address, then the sender, for the device serial', () => {
    const noMac = interpretHikvisionEvent(passEvent({ macAddress: undefined }), options);
    expect(noMac.kind === 'punch' && noMac.punch.deviceSerial).toBe('192.168.1.64');
    const bare = interpretHikvisionEvent(
      passEvent({ macAddress: undefined, ipAddress: undefined }),
      options,
    );
    expect(bare.kind === 'punch' && bare.punch.deviceSerial).toBe('192.168.1.200');
  });

  it('accepts the numeric employeeNo of older firmware', () => {
    const r = interpretHikvisionEvent(
      passEvent({}, { employeeNoString: undefined, employeeNo: 42 }),
      options,
    );
    expect(r.kind === 'punch' && r.punch.deviceUserId).toBe('42');
  });

  it('ignores heartbeats and anything that is not a successful pass', () => {
    expect(
      reason({
        ipAddress: '192.168.1.64',
        eventType: 'heartBeat',
        dateTime: '2026-10-24T09:00:00+06:00',
      }),
    ).toBe('event type heartBeat');
    expect(reason(passEvent({ eventType: 'videoloss' }))).toBe('event type videoloss');
    expect(reason(passEvent({ AccessControllerEvent: undefined }))).toBe(
      'no AccessControllerEvent body',
    );
    expect(reason(passEvent({}, { majorEventType: 3 }))).toBe('major event type 3');
    // 5/21 is "door unlocked", 5/9 is "no such card": neither is a pass.
    expect(reason(passEvent({}, { subEventType: 21 }))).toBe('sub-event type 21 is not a pass');
    expect(reason(passEvent({}, { subEventType: 9 }))).toBe('sub-event type 9 is not a pass');
    expect(reason(passEvent({}, { employeeNoString: '  ' }))).toBe('no employee number');
    expect(reason('text')).toBe('not a JSON object');
    // A real pass that cannot become a punch is flagged, so the agent warns instead of staying quiet.
    expect(interpretHikvisionEvent(passEvent({ dateTime: undefined }), options)).toMatchObject({
      kind: 'ignored',
      pass: true,
    });
    expect(interpretHikvisionEvent(passEvent({}, { subEventType: 21 }), options)).toMatchObject({
      kind: 'ignored',
      pass: false,
    });
  });

  it('still names the device for ignored events, so heartbeats count as seen', () => {
    const r = interpretHikvisionEvent({ macAddress: 'AA:BB', eventType: 'heartBeat' }, options);
    expect(r).toMatchObject({
      kind: 'ignored',
      device: { serialNumber: 'aa:bb', ip: '192.168.1.200' },
    });
  });

  it('honours the configured sub-event types', () => {
    const cardOnly = { ...options, eventTypes: new Set([1]) };
    expect(interpretHikvisionEvent(passEvent({}, { subEventType: 1 }), cardOnly).kind).toBe(
      'punch',
    );
    expect(interpretHikvisionEvent(passEvent({}, { subEventType: 75 }), cardOnly).kind).toBe(
      'ignored',
    );
  });
});
