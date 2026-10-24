import type { Direction, Punch } from './punch.js';
import { formatInZone, parseDateTime } from './time.js';

export interface MultipartPart {
  /** Header names are lower-cased. */
  headers: Record<string, string>;
  body: Buffer;
}

export function boundaryOf(contentType: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/** Some firmware sends multipart bodies under the wrong content type; the first line gives it away. */
function sniffBoundary(body: Buffer): string | null {
  if (body[0] !== 0x2d || body[1] !== 0x2d) return null;
  const lineEnd = body.indexOf(0x0a);
  if (lineEnd < 3 || lineEnd > 200) return null;
  return body.subarray(2, lineEnd).toString('latin1').trim() || null;
}

function parseHeaders(block: Buffer): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of block.toString('latin1').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0)
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return headers;
}

/**
 * Splits a multipart body into its parts. Works on bytes so picture parts pass through untouched,
 * and tolerates bare LF line endings and a missing closing delimiter (a truncated upload).
 */
export function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const delimiter = Buffer.from(`--${boundary}`, 'latin1');
  const parts: MultipartPart[] = [];
  let pos = body.indexOf(delimiter);
  while (pos !== -1) {
    const afterDelimiter = pos + delimiter.length;
    if (body[afterDelimiter] === 0x2d && body[afterDelimiter + 1] === 0x2d) break;
    const lineEnd = body.indexOf(0x0a, afterDelimiter);
    if (lineEnd === -1) break;
    const start = lineEnd + 1;
    const next = body.indexOf(delimiter, start);
    let end = next === -1 ? body.length : next;
    if (next !== -1 && body[end - 1] === 0x0a) end--;
    if (next !== -1 && body[end - 1] === 0x0d) end--;
    const part = body.subarray(start, Math.max(start, end));

    let headerEnd = part.indexOf('\r\n\r\n');
    let separator = 4;
    if (headerEnd === -1) {
      headerEnd = part.indexOf('\n\n');
      separator = 2;
    }
    if (part[0] === 0x0d || part[0] === 0x0a) {
      parts.push({ headers: {}, body: part.subarray(part[0] === 0x0d ? 2 : 1) });
    } else if (headerEnd === -1) {
      parts.push({ headers: parseHeaders(part), body: Buffer.alloc(0) });
    } else {
      parts.push({
        headers: parseHeaders(part.subarray(0, headerEnd)),
        body: part.subarray(headerEnd + separator),
      });
    }
    pos = next;
  }
  return parts;
}

function jsonObject(bytes: Buffer): Record<string, unknown> | null {
  let i = 0;
  while (i < bytes.length && (bytes[i] === 0x20 || (bytes[i]! >= 0x09 && bytes[i]! <= 0x0d))) i++;
  // Check before decoding so a picture part is never turned into a string.
  if (bytes[i] !== 0x7b) return null;
  try {
    const value: unknown = JSON.parse(bytes.subarray(i).toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The event JSON from an HTTP-listening upload: either the whole body, or the first multipart part
 * that parses as a JSON object (the part name varies by firmware: event_log, AccessControllerEvent).
 */
export function extractEventJson(
  contentType: string | undefined,
  body: Buffer,
): Record<string, unknown> | null {
  const declared =
    contentType && /^multipart\//i.test(contentType.trim()) ? boundaryOf(contentType) : null;
  const boundary = declared ?? sniffBoundary(body);
  if (boundary) {
    for (const part of parseMultipart(body, boundary)) {
      const json = jsonObject(part.body);
      if (json) return json;
    }
  }
  return jsonObject(body);
}

export interface HikvisionDevice {
  serialNumber: string;
  ip?: string;
}

export type HikvisionResult =
  | { kind: 'punch'; punch: Punch; device: HikvisionDevice }
  /** `pass` is true for a successful pass that still could not become a punch: worth a warning. */
  | { kind: 'ignored'; reason: string; device: HikvisionDevice | null; pass: boolean };

export interface HikvisionOptions {
  timeZone: string;
  /** Sub-event types that are a successful pass (card, fingerprint, face...). */
  eventTypes: ReadonlySet<number>;
  /** The sender's address, used when the event names no device. */
  remoteIp?: string;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function directionOf(attendanceStatus: string): Direction {
  if (attendanceStatus === 'checkIn' || attendanceStatus === 'overtimeIn') return 'in';
  if (attendanceStatus === 'checkOut' || attendanceStatus === 'overtimeOut') return 'out';
  return 'unknown';
}

/**
 * Turns an event into a punch, or says why it is not one. Only successful access-control passes
 * count; door alarms, failed verifications and heartbeats are ignored but still identify the device.
 */
export function interpretHikvisionEvent(
  event: unknown,
  options: HikvisionOptions,
): HikvisionResult {
  if (!isObject(event)) {
    return { kind: 'ignored', reason: 'not a JSON object', device: null, pass: false };
  }

  const ip = text(event.ipAddress) || options.remoteIp || '';
  const serialNumber = text(event.macAddress).toLowerCase() || ip;
  const device: HikvisionDevice | null = serialNumber
    ? { serialNumber, ...(ip ? { ip } : {}) }
    : null;
  const ignored = (reason: string, pass = false): HikvisionResult => ({
    kind: 'ignored',
    reason,
    device,
    pass,
  });

  const eventType = text(event.eventType);
  if (eventType !== 'AccessControllerEvent') return ignored(`event type ${eventType || 'missing'}`);
  const access = event.AccessControllerEvent;
  if (!isObject(access)) return ignored('no AccessControllerEvent body');
  if (Number(access.majorEventType) !== 5) {
    return ignored(`major event type ${text(access.majorEventType) || 'missing'}`);
  }
  const subEventType = Number(access.subEventType);
  if (!options.eventTypes.has(subEventType)) {
    return ignored(`sub-event type ${text(access.subEventType) || 'missing'} is not a pass`);
  }
  // Older firmware sends only the numeric employeeNo.
  const deviceUserId = text(access.employeeNoString) || text(access.employeeNo);
  if (!deviceUserId) return ignored('no employee number', true);
  const at = parseDateTime(text(event.dateTime), options.timeZone);
  if (at === null) return ignored(`missing or invalid dateTime "${text(event.dateTime)}"`, true);
  if (!device) return ignored('no device address', true);

  return {
    kind: 'punch',
    device,
    punch: {
      deviceSerial: device.serialNumber,
      vendor: 'hikvision',
      deviceUserId,
      punchedAt: formatInZone(at, options.timeZone),
      direction: directionOf(text(access.attendanceStatus)),
    },
  };
}
