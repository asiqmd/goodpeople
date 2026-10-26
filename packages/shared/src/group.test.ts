import { describe, expect, it } from 'vitest';
import { effectivePolicy, POLICY_OVERRIDE_SCHEMAS, policyDifferences } from './group.js';

const casual = { daysPerYear: 10, carryForwardMax: 0, maxDaysPerRequest: null };
const caps = {
  overtimeDailyCapMinutes: 120,
  overtimeWeeklyCapMinutes: 720,
  overtimeMonthlyCapMinutes: 2400 as number | null,
};

describe('effectivePolicy', () => {
  it('is the group’s policy when the company overrides nothing', () => {
    expect(effectivePolicy(casual, null)).toBe(casual);
    expect(effectivePolicy(casual, {})).toEqual(casual);
  });

  it('takes each value the company sets and the group’s for the rest', () => {
    expect(effectivePolicy(casual, { daysPerYear: 14 })).toEqual({ ...casual, daysPerYear: 14 });
  });

  it('lets a company lift a limit by setting it to null', () => {
    expect(effectivePolicy(caps, { overtimeMonthlyCapMinutes: null })).toEqual({
      ...caps,
      overtimeMonthlyCapMinutes: null,
    });
  });

  it('ignores values the area does not have', () => {
    const stale = { daysPerYear: 12, paid: false } as Partial<typeof casual>;
    expect(effectivePolicy(casual, stale)).toEqual({ ...casual, daysPerYear: 12 });
  });

  it('keeps the rest of a leave type as it is', () => {
    const type = { id: 'cl', code: 'CL', ...casual };
    expect(effectivePolicy(type, { carryForwardMax: 5 })).toEqual({ ...type, carryForwardMax: 5 });
  });
});

describe('policyDifferences', () => {
  it('lists only the overridden values that differ from the group’s', () => {
    expect(policyDifferences(casual, { daysPerYear: 10, carryForwardMax: 3 })).toEqual([
      'carryForwardMax',
    ]);
    expect(policyDifferences(casual, null)).toEqual([]);
  });

  it('compares rates by value, not by how they are written', () => {
    const group = { pfEmployeeRate: '7.00', pfEmployerRate: '7.00' };
    expect(policyDifferences(group, { pfEmployeeRate: '7', pfEmployerRate: '8.5' })).toEqual([
      'pfEmployerRate',
    ]);
  });
});

describe('override schemas', () => {
  it('keeps rates with two decimals, as payroll settings do', () => {
    expect(POLICY_OVERRIDE_SCHEMAS.provident_fund.parse({ pfEmployerRate: '8' })).toEqual({
      pfEmployerRate: '8.00',
    });
    expect(POLICY_OVERRIDE_SCHEMAS.provident_fund.safeParse({ pfEmployerRate: '31' }).success).toBe(
      false,
    );
  });

  it('takes caps from a form as numbers and leave in half days', () => {
    expect(POLICY_OVERRIDE_SCHEMAS.overtime_caps.parse({ overtimeDailyCapMinutes: '90' })).toEqual({
      overtimeDailyCapMinutes: 90,
    });
    expect(POLICY_OVERRIDE_SCHEMAS.leave_type.safeParse({ daysPerYear: 10.25 }).success).toBe(
      false,
    );
  });
});
