import { describe, expect, it } from 'vitest';
import { allRules, ruleOn } from '../engine.js';
import { bdHolidayTemplate } from './holidays.js';
import {
  bdEarnedLeaveRate,
  bdLeaveDefaults,
  bdLeaveFloorViolations,
  bdMaternityDays,
} from './leave.js';
import { BD_RULES } from './rules.js';
import { bdShiftViolations, bdWorkLimits } from './attendance.js';
import {
  addMonths,
  bdNoticeDays,
  bdProbationEnd,
  bdProbationLatestEnd,
  bdRetirementDate,
} from './lifecycle.js';

describe('rule lookup across the 2025 amendment', () => {
  it('gives 112 days of maternity leave before 17 November 2025 and 120 from that day', () => {
    expect(ruleOn(BD_RULES, 'leave.maternity.days', '2025-11-16')).toMatchObject({
      value: 112,
      to: '2025-11-16',
      reference: { section: '46' },
    });
    expect(ruleOn(BD_RULES, 'leave.maternity.days', '2025-11-17')).toMatchObject({
      value: 120,
      to: null,
      status: 'needs_review',
    });
  });

  it('raises festival holidays from 11 to 13', () => {
    expect(ruleOn(BD_RULES, 'holidays.festival.days_per_year', '2025-01-01').value).toBe(11);
    expect(ruleOn(BD_RULES, 'holidays.festival.days_per_year', '2026-01-01').value).toBe(13);
  });

  it('refuses dates before the Act', () => {
    expect(() => ruleOn(BD_RULES, 'leave.casual.days_per_year', '2000-01-01')).toThrow(
      /no version/,
    );
  });

  it('cites a section for every version', () => {
    for (const rule of allRules(BD_RULES)) {
      expect(rule.reference.act).toMatch(/Bangladesh Labour/);
      expect(rule.reference.section).toMatch(/^\d+$/);
    }
  });
});

describe('earned leave rate', () => {
  it('follows the statute for the establishment unless the company is more generous', () => {
    expect(bdEarnedLeaveRate(null, 'shop_commercial', '2026-01-01')).toBe(18);
    expect(bdEarnedLeaveRate(null, 'factory', '2025-06-01')).toBe(18);
    expect(bdEarnedLeaveRate(null, 'factory', '2026-01-01')).toBe(14);
    expect(bdEarnedLeaveRate(12, 'factory', '2026-01-01')).toBe(12);
    expect(bdEarnedLeaveRate(20, 'factory', '2026-01-01')).toBe(14);
  });
});

describe('statutory floors', () => {
  const defaults = bdLeaveDefaults('2026-10-24');
  const type = (code: string) => defaults.find((d) => d.code === code)!;

  it('provisions defaults that meet the law', () => {
    for (const policy of defaults) expect(bdLeaveFloorViolations(policy, '2026-10-24')).toEqual([]);
    expect(type('ML').maxDaysPerRequest).toBe(120);
    expect(type('CL').daysPerYear).toBe(10);
  });

  it('refuses a policy below the statute, quoting the section', () => {
    const violations = bdLeaveFloorViolations({ ...type('CL'), daysPerYear: 8 }, '2026-10-24');
    expect(violations).toEqual([
      expect.objectContaining({
        field: 'daysPerYear',
        message: 'Casual leave must be at least 10 days a year',
        reference: expect.objectContaining({ section: '115' }),
      }),
    ]);
    expect(
      bdLeaveFloorViolations({ ...type('ML'), maxDaysPerRequest: 112 }, '2026-10-24'),
    ).toHaveLength(1);
    expect(
      bdLeaveFloorViolations({ ...type('AL'), carryForwardMax: 20 }, '2026-10-24'),
    ).toHaveLength(1);
  });

  it('applies the maternity days in force on the start date, or more if the company gives more', () => {
    expect(bdMaternityDays(null, '2025-10-01')).toBe(112);
    expect(bdMaternityDays(null, '2026-01-10')).toBe(120);
    expect(bdMaternityDays(180, '2026-01-10')).toBe(180);
  });
});

describe('holiday template', () => {
  it('has the fixed national days for any year and marks lunar estimates tentative', () => {
    const y2027 = bdHolidayTemplate(2027);
    expect(y2027.find((h) => h.date === '2027-12-16')).toMatchObject({
      name: 'Victory Day',
      tentative: false,
    });
    const eid = y2027.filter((h) => h.name === 'Eid-ul-Fitr');
    expect(eid).toHaveLength(3);
    expect(eid.every((h) => h.tentative && h.kind === 'festival')).toBe(true);
    expect(bdHolidayTemplate(2031).every((h) => !h.tentative)).toBe(true);
  });

  it('never has two holidays on the same date', () => {
    for (const year of [2026, 2027]) {
      const dates = bdHolidayTemplate(year).map((h) => h.date);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
});

describe('working time', () => {
  it('accepts a 9-to-6 shift with an hour’s break', () => {
    expect(bdShiftViolations({ spanMinutes: 540, breakMinutes: 60 }, '2026-10-24')).toEqual([]);
  });

  it('refuses a shift that schedules overtime inside it', () => {
    const [violation] = bdShiftViolations({ spanMinutes: 600, breakMinutes: 60 }, '2026-10-24');
    expect(violation).toMatchObject({ field: 'span', reference: { section: '100' } });
  });

  it('needs half an hour of rest after 5 hours and an hour after 6', () => {
    expect(bdShiftViolations({ spanMinutes: 330, breakMinutes: 0 }, '2026-10-24')).toEqual([
      expect.objectContaining({ field: 'breakMinutes', message: expect.stringMatching(/30/) }),
    ]);
    expect(bdShiftViolations({ spanMinutes: 330, breakMinutes: 30 }, '2026-10-24')).toEqual([]);
    expect(bdShiftViolations({ spanMinutes: 450, breakMinutes: 30 }, '2026-10-24')).toEqual([
      expect.objectContaining({ field: 'breakMinutes', message: expect.stringMatching(/60/) }),
    ]);
  });

  it('caps a day at 10 hours and a week at 60 with overtime', () => {
    expect(bdWorkLimits('2026-10-24')).toEqual({ dailyMaxMinutes: 600, weeklyMaxMinutes: 3600 });
  });
});

describe('lifecycle', () => {
  it('sets probation at three months, six for clerical work, plus three for skilled workers', () => {
    expect(bdProbationEnd('2026-01-15', 'other')).toBe('2026-04-14');
    expect(bdProbationEnd('2026-01-15', 'clerical')).toBe('2026-07-14');
    expect(bdProbationLatestEnd('2026-01-15', 'other', true)).toBe('2026-07-14');
    expect(bdProbationLatestEnd('2026-01-15', 'other', false)).toBe('2026-04-14');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('gives notice periods by tenure, and none for dismissal', () => {
    const permanent = { permanent: true, monthlyRated: true };
    const temporary = { permanent: false, monthlyRated: true };
    expect(bdNoticeDays('resignation', permanent, '2026-10-24')).toBe(60);
    expect(bdNoticeDays('termination', permanent, '2026-10-24')).toBe(120);
    expect(
      bdNoticeDays('termination', { permanent: true, monthlyRated: false }, '2026-10-24'),
    ).toBe(60);
    expect(bdNoticeDays('resignation', temporary, '2026-10-24')).toBe(30);
    expect(bdNoticeDays('retrenchment', permanent, '2026-10-24')).toBe(30);
    expect(bdNoticeDays('dismissal', permanent, '2026-10-24')).toBeNull();
  });

  it('retires at 60', () => {
    expect(bdRetirementDate('1970-03-05')).toBe('2030-03-05');
  });
});
