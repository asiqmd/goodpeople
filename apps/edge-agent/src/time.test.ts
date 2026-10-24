import { describe, expect, it } from 'vitest';
import {
  formatInZone,
  offsetMinutesAt,
  parseDateTime,
  wallTimeToEpoch,
  type WallTime,
} from './time.js';

const wall = (text: string): WallTime => {
  const [date, time] = text.split(' ') as [string, string];
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute, second] = time.split(':').map(Number) as [number, number, number];
  return { year, month, day, hour, minute, second };
};
const local = (text: string, zone: string) => formatInZone(wallTimeToEpoch(wall(text), zone), zone);

describe('wall time to an instant with its offset', () => {
  it('gives Dhaka +06:00 all year round', () => {
    expect(local('2026-10-24 08:59:12', 'Asia/Dhaka')).toBe('2026-10-24T08:59:12+06:00');
    expect(local('2026-01-01 00:00:00', 'Asia/Dhaka')).toBe('2026-01-01T00:00:00+06:00');
    expect(wallTimeToEpoch(wall('2026-10-24 08:59:12'), 'Asia/Dhaka')).toBe(
      Date.parse('2026-10-24T02:59:12Z'),
    );
  });

  it('handles half-hour and negative offsets', () => {
    expect(local('2026-10-24 08:00:00', 'Asia/Kolkata')).toBe('2026-10-24T08:00:00+05:30');
    expect(local('2026-07-01 12:00:00', 'America/New_York')).toBe('2026-07-01T12:00:00-04:00');
    expect(local('2026-12-01 12:00:00', 'America/New_York')).toBe('2026-12-01T12:00:00-05:00');
  });

  it('follows London across the autumn change (clocks go back at 02:00 BST on 25 Oct 2026)', () => {
    const zone = 'Europe/London';
    expect(local('2026-10-25 00:30:00', zone)).toBe('2026-10-25T00:30:00+01:00');
    // 01:30 happens twice; the first one (still BST) is taken.
    expect(local('2026-10-25 01:30:00', zone)).toBe('2026-10-25T01:30:00+01:00');
    expect(local('2026-10-25 02:30:00', zone)).toBe('2026-10-25T02:30:00+00:00');
    expect(local('2026-10-26 09:00:00', zone)).toBe('2026-10-26T09:00:00+00:00');
  });

  it('follows London across the spring change (clocks go forward at 01:00 GMT on 29 Mar 2026)', () => {
    const zone = 'Europe/London';
    expect(local('2026-03-29 00:59:59', zone)).toBe('2026-03-29T00:59:59+00:00');
    // 01:30 never happens; it is moved forward by the hour that was skipped.
    expect(local('2026-03-29 01:30:00', zone)).toBe('2026-03-29T02:30:00+01:00');
    expect(local('2026-03-29 02:00:00', zone)).toBe('2026-03-29T02:00:00+01:00');
  });

  it('reads the offset at an instant', () => {
    expect(offsetMinutesAt(Date.parse('2026-10-24T00:00:00Z'), 'Asia/Dhaka')).toBe(360);
    expect(offsetMinutesAt(Date.parse('2026-10-25T00:59:59Z'), 'Europe/London')).toBe(60);
    expect(offsetMinutesAt(Date.parse('2026-10-25T01:00:00Z'), 'Europe/London')).toBe(0);
  });
});

describe('parsing date-times', () => {
  it('keeps the instant of a time with an offset', () => {
    expect(parseDateTime('2026-10-24T08:59:12+06:00', 'Europe/London')).toBe(
      Date.parse('2026-10-24T02:59:12Z'),
    );
    expect(parseDateTime('2026-10-24T02:59:12Z', 'Asia/Dhaka')).toBe(
      Date.parse('2026-10-24T02:59:12Z'),
    );
    expect(parseDateTime('2026-10-24T08:59:12.250+0600', 'UTC')).toBe(
      Date.parse('2026-10-24T02:59:12Z'),
    );
  });

  it('reads a time without an offset as wall time in the zone', () => {
    expect(parseDateTime('2026-10-24T08:59:12', 'Asia/Dhaka')).toBe(
      Date.parse('2026-10-24T02:59:12Z'),
    );
  });

  it('refuses things that are not date-times', () => {
    for (const bad of [
      '',
      'yesterday',
      '2026-02-30T10:00:00',
      '2026-10-24T25:00:00',
      '2026-10-24',
    ]) {
      expect(parseDateTime(bad, 'Asia/Dhaka')).toBeNull();
    }
  });
});
