import type { Direction, Punch } from './punch.js';
import { formatInZone, isValidWallTime, offsetMinutesAt, wallTimeToEpoch } from './time.js';

/** ATTLOG status codes: 0 check-in, 1 check-out, 4 overtime in, 5 overtime out. */
export function directionForStatus(status: number | null): Direction {
  switch (status) {
    case 0:
    case 4:
      return 'in';
    case 1:
    case 5:
      return 'out';
    default:
      return 'unknown';
  }
}

/**
 * What a ZKTeco device gets when it asks for its options on start-up. TimeZone is whole hours, so
 * zones with a half-hour offset are rounded; the agent never relies on it (punch times are
 * converted with GP_TIME_ZONE).
 */
export function admsOptions(serial: string, timeZone: string, now = Date.now()): string {
  const offsetHours = Math.round(offsetMinutesAt(now, timeZone) / 60);
  return [
    `GET OPTION FROM: ${serial}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog',
    `TimeZone=${offsetHours}`,
    'Realtime=1',
    'Encrypt=None',
  ].join('\n');
}

export interface SkippedLine {
  /** 1-based line number in the body. */
  line: number;
  text: string;
  reason: string;
}

export interface AttlogParseResult {
  punches: Punch[];
  skipped: SkippedLine[];
}

// PIN, date, time, then the optional tab-separated status, verify, workcode, ...
const ATTLOG_LINE =
  /^(\S+)[\t ]+(\d{4})-(\d{1,2})-(\d{1,2})[\t ]+(\d{1,2}):(\d{2})(?::(\d{2}))?((?:[\t ].*)?)$/;

/**
 * Parses an ATTLOG upload. Times are the device's wall clock in `timeZone`. A bad line is skipped
 * and reported rather than failing the upload, so one corrupt record cannot block the rest.
 */
export function parseAttlog(
  body: string,
  deviceSerial: string,
  timeZone: string,
): AttlogParseResult {
  const punches: Punch[] = [];
  const skipped: SkippedLine[] = [];
  body.split('\n').forEach((raw, index) => {
    const text = raw.replace(/\r$/, '');
    if (text.trim() === '') return;
    const m = ATTLOG_LINE.exec(text.trim());
    if (!m) {
      skipped.push({ line: index + 1, text, reason: 'not a PIN, date and time' });
      return;
    }
    const wall = {
      year: Number(m[2]),
      month: Number(m[3]),
      day: Number(m[4]),
      hour: Number(m[5]),
      minute: Number(m[6]),
      second: Number(m[7] ?? 0),
    };
    if (!isValidWallTime(wall)) {
      skipped.push({ line: index + 1, text, reason: 'impossible date or time' });
      return;
    }
    const rest = m[8] ?? '';
    // Keep empty tab-separated fields in place so a blank status is not mistaken for the next one.
    const fields = rest.includes('\t') ? rest.split('\t').slice(1) : rest.trim().split(/ +/);
    const statusText = fields[0]?.trim() ?? '';
    const status = /^\d+$/.test(statusText) ? Number(statusText) : null;
    punches.push({
      deviceSerial,
      vendor: 'zkteco',
      deviceUserId: m[1]!,
      punchedAt: formatInZone(wallTimeToEpoch(wall, timeZone), timeZone),
      direction: directionForStatus(status),
    });
  });
  return { punches, skipped };
}
