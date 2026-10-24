import { describe, expect, it } from 'vitest';
import { countLeaveDays, weekdayOf } from './leave.js';
import { leaveRequestInputSchema, leaveTypeInputSchema } from './leave-schemas.js';

const FRIDAY_OFF = [5];
const noHolidays = new Map<string, string>();

describe('countLeaveDays', () => {
  it('knows 2026-10-30 is a Friday', () => {
    expect(weekdayOf('2026-10-30')).toBe(5);
  });

  it('skips the weekly off day and holidays inside the range', () => {
    // Wed 28 Oct to Tue 3 Nov 2026: 7 calendar days, Friday 30 Oct off, 2 Nov a holiday.
    const result = countLeaveDays('2026-10-28', '2026-11-03', {
      weeklyOffDays: FRIDAY_OFF,
      holidays: new Map([['2026-11-02', 'Company day']]),
      countsOffDays: false,
    });
    expect(result.days).toBe(5);
    expect(result.excluded).toEqual([
      { date: '2026-10-30', reason: 'weekly_off' },
      { date: '2026-11-02', reason: 'holiday', name: 'Company day' },
    ]);
  });

  it('counts calendar days when the type says so (maternity)', () => {
    const result = countLeaveDays('2026-10-28', '2026-11-03', {
      weeklyOffDays: FRIDAY_OFF,
      holidays: new Map([['2026-11-02', 'Company day']]),
      countsOffDays: true,
    });
    expect(result.days).toBe(7);
  });

  it('counts a half day as 0.5, and nothing on an off day', () => {
    expect(
      countLeaveDays('2026-10-28', '2026-10-28', {
        weeklyOffDays: FRIDAY_OFF,
        holidays: noHolidays,
        countsOffDays: false,
        halfDay: 'first_half',
      }).days,
    ).toBe(0.5);
    expect(
      countLeaveDays('2026-10-30', '2026-10-30', {
        weeklyOffDays: FRIDAY_OFF,
        holidays: noHolidays,
        countsOffDays: false,
        halfDay: 'first_half',
      }).days,
    ).toBe(0);
  });
});

describe('leave request rules', () => {
  const base = {
    leaveTypeId: '7a1a3b0e-62b4-4f52-9d3f-3f1f1b6f2c11',
    startDate: '2026-12-30',
    endDate: '2026-12-31',
    reason: 'Family wedding',
  };

  it('refuses leave that crosses 31 December', () => {
    const result = leaveRequestInputSchema.safeParse({ ...base, endDate: '2027-01-02' });
    expect(result.error?.issues.map((i) => i.message)).toContain(
      'Leave cannot cross 31 December: split it into two requests',
    );
  });

  it('allows a half day only on a single date', () => {
    expect(leaveRequestInputSchema.safeParse({ ...base, halfDay: 'first_half' }).success).toBe(
      false,
    );
    expect(
      leaveRequestInputSchema.safeParse({ ...base, endDate: base.startDate, halfDay: 'first_half' })
        .success,
    ).toBe(true);
  });

  it('requires the fields each accrual needs', () => {
    const type = {
      code: 'PL',
      name: 'Paternity leave',
      paid: true,
      accrual: 'per_event',
      approvalChain: ['manager'],
    };
    expect(leaveTypeInputSchema.safeParse(type).success).toBe(false);
    expect(leaveTypeInputSchema.safeParse({ ...type, maxDaysPerRequest: 7 }).success).toBe(true);
  });
});
