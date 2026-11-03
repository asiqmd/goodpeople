import { describe, expect, it } from 'vitest';
import {
  compensationCreateSchema,
  compensationProposalSchema,
  positionInRange,
} from './compensation.js';

const id = '00000000-0000-4000-8000-000000000001';
describe('compensation planning contract', () => {
  it('assigns exact midpoint and maximum boundaries without floating point', () => {
    expect(positionInRange('14999.99', '10000', '20000')).toBe('below_midpoint');
    expect(positionInRange('15000', '10000', '20000')).toBe('to_maximum');
    expect(positionInRange('20000', '10000', '20000')).toBe('to_maximum');
    expect(positionInRange('20000.01', '10000', '20000')).toBe('above_maximum');
  });
  it('requires a released-cycle choice or an RMG annual round, unique budgets and valid ranges', () => {
    const base = {
      name: 'Annual round',
      legalEntityId: id,
      effectiveFrom: '2026-12-01',
      ranges: [],
      budgets: [{ orgUnitId: null, monthlyAmount: '10000' }],
    };
    expect(compensationCreateSchema.safeParse(base).success).toBe(false);
    expect(compensationCreateSchema.safeParse({ ...base, rmgAnnual: true }).success).toBe(true);
    expect(compensationCreateSchema.safeParse({ ...base, cycleId: id }).success).toBe(true);
    expect(
      compensationCreateSchema.safeParse({
        ...base,
        cycleId: id,
        budgets: [...base.budgets, ...base.budgets],
      }).success,
    ).toBe(false);
    expect(
      compensationCreateSchema.safeParse({
        ...base,
        cycleId: id,
        ranges: [{ gradeId: id, minimum: '100', maximum: '100' }],
      }).success,
    ).toBe(false);
  });
  it('refuses negative, excessive or non-finite proposals and requires a reason and version', () => {
    const base = { percent: '5.50', reason: 'Reward the performance', version: 0 };
    expect(compensationProposalSchema.safeParse(base).success).toBe(true);
    for (const percent of ['-1', '100.01', 'Infinity', 'NaN', '1e3'])
      expect(compensationProposalSchema.safeParse({ ...base, percent }).success).toBe(false);
    expect(compensationProposalSchema.safeParse({ ...base, reason: '' }).success).toBe(false);
    expect(compensationProposalSchema.safeParse({ ...base, version: -1 }).success).toBe(false);
  });
});
