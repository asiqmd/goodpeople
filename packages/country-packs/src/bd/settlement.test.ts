import { describe, expect, it } from 'vitest';
import { ruleOn } from '../engine.js';
import { BD_RULES } from './rules.js';
import { bdGratuity, bdServiceMonths, bdServiceYears, bdSettlement } from './settlement.js';

const base = {
  joinedOn: '2020-01-01',
  noticeDate: '2026-06-01',
  lastWorkingDay: '2026-07-31',
  permanent: true,
  earnedLeaveDays: 0,
  gratuity: false,
};

const resign = (joinedOn: string, lastWorkingDay: string) =>
  bdSettlement({
    ...base,
    kind: 'resignation',
    joinedOn,
    lastWorkingDay,
    noticeDate: lastWorkingDay,
  }).benefits;

describe('service', () => {
  it('counts a month once its last day is served', () => {
    expect(bdServiceMonths('2024-01-01', '2024-12-31')).toBe(12);
    expect(bdServiceMonths('2024-01-01', '2024-12-30')).toBe(11);
    expect(bdServiceMonths('2024-01-31', '2024-02-28')).toBe(1);
    expect(bdServiceMonths('2024-05-01', '2024-04-30')).toBe(0);
  });

  it('counts a part year over six months as a year only where the Act says so', () => {
    // 5 years and 6 months exactly: not more than six months.
    expect(bdServiceYears('2020-01-01', '2025-06-30', true)).toBe(5);
    // A day more is.
    expect(bdServiceYears('2020-01-01', '2025-07-01', true)).toBe(6);
    expect(bdServiceYears('2020-01-01', '2025-12-30')).toBe(5);
  });
});

describe('the resignation benefit across the 2025 amendment', () => {
  it('paid nothing under five years and 14 days a year from five before 17 November 2025', () => {
    expect(resign('2021-01-01', '2025-10-31')).toEqual([]);
    expect(resign('2019-01-01', '2025-10-31')).toEqual([
      expect.objectContaining({ code: 'SEPARATION_BENEFIT', years: 6, daysPerYear: 14, days: 84 }),
    ]);
  });

  it('pays 7 days a year up to three years, 15 to ten and 30 from ten after it', () => {
    expect(resign('2024-01-01', '2026-12-31')[0]).toMatchObject({
      years: 3,
      daysPerYear: 7,
      days: 21,
    });
    expect(resign('2023-01-01', '2026-01-31')[0]).toMatchObject({
      years: 3,
      daysPerYear: 15,
      days: 45,
    });
    expect(resign('2016-01-01', '2025-12-31')[0]).toMatchObject({ years: 10, daysPerYear: 30 });
    expect(resign('2026-01-01', '2026-10-31')).toEqual([]);
  });

  it('gives a resigning worker who left early the notice to pay back', () => {
    const days = bdSettlement({ ...base, kind: 'resignation', noticeDate: '2026-07-11' });
    expect(days.notice).toEqual({
      requiredDays: 60,
      servedDays: 20,
      shortDays: 40,
      owedBy: 'employee',
    });
  });
});

describe('gratuity', () => {
  it('pays 30 days a year, 45 once service exceeds ten years, counting part years', () => {
    expect(bdGratuity('2020-01-01', '2026-07-31')).toMatchObject({
      years: 7,
      daysPerYear: 30,
      days: 210,
    });
    expect(bdGratuity('2015-01-01', '2025-06-30')).toMatchObject({
      years: 10,
      daysPerYear: 45,
      days: 450,
    });
    expect(bdGratuity('2016-01-01', '2025-12-31')).toMatchObject({ years: 10, daysPerYear: 30 });
  });

  it('replaces compensation when higher, and is never paid with it', () => {
    const termination = bdSettlement({
      ...base,
      kind: 'termination',
      gratuity: true,
      lastWorkingDay: '2026-06-30',
    });
    expect(termination.benefits).toEqual([
      expect.objectContaining({ code: 'SEPARATION_BENEFIT', years: 6, days: 180 }),
    ]);
    // Gratuity counts the seven months past six years; compensation counts completed years.
    const later = bdSettlement({ ...base, kind: 'termination', gratuity: true });
    expect(later.benefits.map((b) => [b.code, b.days])).toEqual([['GRATUITY', 210]]);
  });

  it('is only owed under an employer scheme', () => {
    expect(bdSettlement({ ...base, kind: 'contract_end', gratuity: false }).benefits).toEqual([]);
    expect(
      bdSettlement({ ...base, kind: 'contract_end', gratuity: true }).benefits.map((b) => b.code),
    ).toEqual(['GRATUITY']);
  });
});

describe('other separations', () => {
  it('pays the employer side of notice not given and nothing to a temporary worker', () => {
    const days = bdSettlement({ ...base, kind: 'termination', noticeDate: '2026-07-01' });
    expect(days.notice).toMatchObject({ requiredDays: 120, shortDays: 90, owedBy: 'employer' });
    expect(bdSettlement({ ...base, kind: 'termination', permanent: false }).benefits).toEqual([]);
  });

  it('pays the death benefit after one year from the amendment, at 45 days for a work accident', () => {
    const death = { ...base, kind: 'death' as const, joinedOn: '2024-06-01' };
    expect(bdSettlement({ ...death, lastWorkingDay: '2025-10-31' }).benefits).toEqual([]);
    expect(bdSettlement({ ...death, lastWorkingDay: '2025-12-31' }).benefits[0]).toMatchObject({
      years: 2,
      daysPerYear: 30,
    });
    expect(
      bdSettlement({ ...death, lastWorkingDay: '2025-12-31', workAccident: true }).benefits[0],
    ).toMatchObject({ daysPerYear: 45, days: 90 });
  });

  it('pays dismissal 15 days a year from a year of service', () => {
    expect(bdSettlement({ ...base, kind: 'dismissal' }).benefits[0]).toMatchObject({
      daysPerYear: 15,
      days: 90,
    });
  });

  it('counts compensation on the last month from the amendment', () => {
    expect(ruleOn(BD_RULES, 'separation.wage_basis', '2025-11-16').value).toBe('average_12_months');
    expect(ruleOn(BD_RULES, 'separation.wage_basis', '2025-11-17').value).toBe('last_month');
  });

  it('pays the whole participation fund in cash from the amendment', () => {
    expect(ruleOn(BD_RULES, 'wppf.shares', '2025-06-30').value.cash).toEqual({
      numerator: 2,
      denominator: 3,
    });
    expect(ruleOn(BD_RULES, 'wppf.shares', '2026-06-30').value.cash).toEqual({
      numerator: 1,
      denominator: 1,
    });
  });
});
