import { describe, expect, it } from 'vitest';
import { attendanceShare, percentOf, readingPeriod } from './kpi-records.js';

describe('the attendance rate from processed days', () => {
  it('counts days present of the working days scheduled', () => {
    const share = attendanceShare([
      { status: 'present', leaveDays: 0, days: 21 },
      { status: 'absent', leaveDays: 0, days: 2 },
    ]);
    expect(share).toEqual({ presentDays: 21, workingDays: 23 });
    expect(percentOf(share.presentDays, share.workingDays)).toBe(91.3);
  });

  it('takes approved leave out of the days scheduled, a half day’s leave by half', () => {
    expect(
      attendanceShare([
        { status: 'present', leaveDays: 0, days: 18 },
        { status: 'on_leave', leaveDays: 1, days: 3 },
        { status: 'present', leaveDays: 0.5, days: 2 },
        { status: 'absent', leaveDays: 0.5, days: 1 },
      ]),
    ).toEqual({ presentDays: 19, workingDays: 19.5 });
  });

  it('counts a half day as half, one punch as present, and leaves out days not over', () => {
    expect(
      attendanceShare([
        { status: 'half_day', leaveDays: 0, days: 2 },
        { status: 'missing_punch', leaveDays: 0, days: 1 },
        { status: 'pending', leaveDays: 0, days: 1 },
      ]),
    ).toEqual({ presentDays: 2, workingDays: 3 });
  });

  it('has no rate before any working day is processed', () => {
    expect(attendanceShare([])).toEqual({ presentDays: 0, workingDays: 0 });
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe('output against target', () => {
  it('is the pieces made as a share of the day targets, to two decimals', () => {
    expect(percentOf(4120, 4400)).toBe(93.64);
    expect(percentOf(4620, 4400)).toBe(105);
    expect(percentOf(10, 0)).toBeNull();
  });
});

describe('the period a KPI from the records is read over', () => {
  it('runs from the start to today, or to the due date once it has passed', () => {
    expect(readingPeriod({ startsOn: '2026-07-01', dueOn: '2026-12-31' }, '2026-11-01')).toEqual({
      from: '2026-07-01',
      to: '2026-11-01',
    });
    expect(readingPeriod({ startsOn: '2026-01-01', dueOn: '2026-06-30' }, '2026-11-01')).toEqual({
      from: '2026-01-01',
      to: '2026-06-30',
    });
    expect(readingPeriod({ startsOn: '2026-07-01', dueOn: null }, '2026-11-01')?.to).toBe(
      '2026-11-01',
    );
    expect(readingPeriod({ startsOn: null, dueOn: '2026-12-31' }, '2026-11-01')).toBeNull();
  });
});
