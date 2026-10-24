import { describe, expect, it } from 'vitest';
import {
  dayBoundary,
  distanceMeters,
  evaluateDay,
  localParts,
  shiftSpanMinutes,
  shiftWindow,
  zonedInstant,
  type DayInput,
  type ShiftSchedule,
} from './attendance.js';
import {
  regularizationInputSchema,
  shiftInputSchema,
  shiftUpdateSchema,
} from './attendance-schemas.js';
import { updateEmployeeSchema } from './hr-schemas.js';
import { holidayUpdateSchema, leaveTypeUpdateSchema } from './leave-schemas.js';

const DHAKA = 'Asia/Dhaka';
const at = (iso: string) => new Date(iso);

describe('time zones', () => {
  it('turns Dhaka wall time into an instant and back', () => {
    expect(zonedInstant('2026-10-24', '09:00', DHAKA).toISOString()).toBe(
      '2026-10-24T03:00:00.000Z',
    );
    expect(localParts(at('2026-10-24T20:30:00Z'), DHAKA)).toEqual({
      date: '2026-10-25',
      time: '02:30',
    });
  });

  it('follows daylight saving time', () => {
    expect(zonedInstant('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
    expect(zonedInstant('2026-12-01', '09:00', 'Europe/London').toISOString()).toBe(
      '2026-12-01T09:00:00.000Z',
    );
  });
});

describe('geofence distance', () => {
  it('measures about 1.1 km per hundredth of a degree of latitude', () => {
    const d = distanceMeters(
      { latitude: 23.81, longitude: 90.41 },
      { latitude: 23.82, longitude: 90.41 },
    );
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1125);
  });
});

describe('shifts', () => {
  it('runs a night shift past midnight', () => {
    expect(shiftSpanMinutes('20:00', '05:00')).toBe(540);
    const w = shiftWindow('2026-10-24', { startTime: '20:00', endTime: '05:00' }, DHAKA);
    expect(w.start.toISOString()).toBe('2026-10-24T14:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });

  it('splits days four hours before the next shift, or mid-gap after a night shift', () => {
    const dayShiftEnd = at('2026-10-24T12:00:00Z'); // 18:00 Dhaka
    const nextMorning = at('2026-10-25T03:00:00Z'); // 09:00
    expect(dayBoundary(dayShiftEnd, nextMorning).toISOString()).toBe('2026-10-24T23:00:00.000Z');
    const nightEnd = at('2026-10-24T23:00:00Z'); // 05:00
    const morningAfter = at('2026-10-25T02:00:00Z'); // 08:00
    expect(dayBoundary(nightEnd, morningAfter).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('validates shift input', () => {
    expect(
      shiftInputSchema.safeParse({
        code: 'G',
        name: 'General',
        startTime: '9:00',
        endTime: '18:00',
      }).success,
    ).toBe(false);
    expect(
      shiftInputSchema.safeParse({
        code: 'G',
        name: 'General',
        startTime: '09:00',
        endTime: '18:00',
        halfDayMinutes: 400,
        fullDayMinutes: 300,
      }).success,
    ).toBe(false);
  });
});

const GENERAL: ShiftSchedule = {
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  lateGraceMinutes: 10,
  earlyOutGraceMinutes: 0,
  halfDayMinutes: 240,
  fullDayMinutes: 360,
  overtimeEnabled: true,
  overtimeMinMinutes: 30,
  overtimeRoundingMinutes: 30,
};

/** A day on the general shift in Dhaka, 24 October 2026 (09:00–18:00 is 03:00–12:00 UTC). */
function day(overrides: Partial<DayInput> & { times?: string[] } = {}) {
  const { times = [], ...rest } = overrides;
  return evaluateDay({
    shift: GENERAL,
    window: { start: at('2026-10-24T03:00:00Z'), end: at('2026-10-24T12:00:00Z') },
    closesAt: at('2026-10-24T23:00:00Z'),
    dayType: 'working',
    leave: null,
    onDuty: false,
    punches: times.map((t) => zonedInstant('2026-10-24', t, DHAKA)),
    now: at('2026-10-26T00:00:00Z'),
    dailyMaxMinutes: 600,
    ...rest,
  });
}

describe('a working day', () => {
  it('is present on time, with the break taken out', () => {
    expect(day({ times: ['08:55', '13:02', '18:03'] })).toMatchObject({
      status: 'present',
      workedMinutes: 488,
      lateMinutes: 0,
      overtimeMinutes: 0,
      flags: [],
    });
  });

  it('is late only beyond the grace minutes, counted from the shift start', () => {
    expect(day({ times: ['09:10', '18:00'] }).lateMinutes).toBe(0);
    expect(day({ times: ['09:25', '18:00'] })).toMatchObject({ lateMinutes: 25, flags: ['late'] });
  });

  it('flags leaving early', () => {
    expect(day({ times: ['09:00', '17:15'] })).toMatchObject({
      earlyOutMinutes: 45,
      flags: ['early_out'],
    });
  });

  it('counts overtime after the shift in whole half hours, from 30 minutes', () => {
    expect(day({ times: ['09:00', '19:45'] }).overtimeMinutes).toBe(90);
    expect(day({ times: ['09:00', '18:25'] }).overtimeMinutes).toBe(0);
    // Arriving late and staying late only makes up the hours.
    expect(day({ times: ['10:00', '19:00'] }).overtimeMinutes).toBe(0);
  });

  it('gives a half day or an absence for short hours', () => {
    expect(day({ times: ['09:00', '14:00'] }).status).toBe('half_day');
    expect(day({ times: ['09:00', '11:00'] }).status).toBe('absent');
  });

  it('is absent with no punches, and missing a punch with one', () => {
    expect(day()).toMatchObject({ status: 'absent', firstIn: null });
    expect(day({ times: ['09:00'] })).toMatchObject({ status: 'missing_punch', workedMinutes: 0 });
  });

  it('stays pending until the day closes', () => {
    const now = at('2026-10-24T06:00:00Z');
    expect(day({ now }).status).toBe('pending');
    expect(day({ now, times: ['09:00'] })).toMatchObject({
      status: 'pending',
      firstIn: expect.any(Date),
    });
  });

  it('flags more than 10 hours of work', () => {
    expect(day({ times: ['08:00', '21:00'] }).flags).toContain('over_daily_limit');
  });
});

describe('leave, offs and on-duty days', () => {
  it('is on leave for full-day leave', () => {
    expect(day({ leave: { days: 1 }, times: [] }).status).toBe('on_leave');
  });

  it('expects arrival at mid-shift after first-half leave', () => {
    expect(
      day({ leave: { days: 0.5, half: 'first_half' }, times: ['13:30', '18:00'] }),
    ).toMatchObject({ status: 'present', lateMinutes: 0 });
  });

  it('counts all work on a weekly off as overtime', () => {
    expect(day({ dayType: 'weekly_off', times: ['10:00', '14:10'] })).toMatchObject({
      status: 'present',
      overtimeMinutes: 240,
    });
    expect(day({ dayType: 'holiday' }).status).toBe('off');
    // Not "pending" while the day is still open or in the future.
    expect(day({ dayType: 'weekly_off', now: at('2026-10-20T00:00:00Z') }).status).toBe('off');
  });

  it('counts an on-duty day as the full shift', () => {
    expect(day({ onDuty: true })).toMatchObject({
      status: 'present',
      workedMinutes: 480,
      flags: ['on_duty'],
    });
  });
});

describe('updates leave out what they are not given', () => {
  it('keeps defaults out of PATCH schemas', () => {
    expect(leaveTypeUpdateSchema.parse({ name: 'Annual leave' })).toEqual({ name: 'Annual leave' });
    expect(holidayUpdateSchema.parse({ name: 'Victory Day' })).toEqual({ name: 'Victory Day' });
    expect(updateEmployeeSchema.parse({})).toEqual({});
    expect(shiftUpdateSchema.parse({ name: 'Day' })).toEqual({ name: 'Day' });
  });
});

describe('regularization input', () => {
  it('needs a time for a missed punch and none for on duty', () => {
    const base = { date: '2026-10-20', reason: 'Device was offline' };
    expect(regularizationInputSchema.safeParse({ ...base, kind: 'missed_punch' }).success).toBe(
      false,
    );
    expect(
      regularizationInputSchema.safeParse({ ...base, kind: 'missed_punch', outTime: '18:05' })
        .success,
    ).toBe(true);
    expect(
      regularizationInputSchema.safeParse({ ...base, kind: 'on_duty', inTime: '09:00' }).success,
    ).toBe(false);
  });
});
