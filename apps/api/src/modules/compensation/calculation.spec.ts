import { BD_PAY_COMPONENTS, BD_SALARY_STRUCTURES } from '@gp/country-packs';
import type { CompensationAmounts } from '@gp/shared';
import { budgetUse, compensationPay } from './calculation.js';
import { workOutPay } from '../payroll/pay-calc.js';
import { amountFor } from '../payroll/pay-batches.service.js';
import { Decimal } from '@gp/shared';

const structure = BD_SALARY_STRUCTURES.find((s) => s.wageBoard === 'BD_RMG_2023')!;
const components = BD_PAY_COMPONENTS.map((c) => ({ ...c, isActive: true }));
const pay = workOutPay(structure, components, '12500', {});
const basic = pay.lines.find((l) => l.code === 'BASIC')!.amount;
const before: CompensationAmounts = {
  amount: '12500',
  fixed: {},
  grossBefore: pay.gross,
  basicBefore: basic,
  suggestedPercent: '0',
  percent: '0',
  amountAfter: '12500',
  grossAfter: pay.gross,
  basicAfter: basic,
  minimumBasic: '7325',
  band: 'above_maximum',
};

describe('increment calculations and budgets', () => {
  it('finds a basic floor with small basic shares and fixed allowances, but rejects impossible floors', () => {
    const lowBasic = {
      basis: 'gross' as const,
      wageBoard: null,
      lines: [
        { component: 'BASIC', formula: 'round(GROSS * 0.1)' },
        { component: 'HOUSE_RENT', formula: 'GROSS - BASIC' },
      ],
    };
    const amount = amountFor(lowBasic, components, {}, 'BASIC', new Decimal(3000));
    expect(amount).not.toBeNull();
    expect(
      Number(
        workOutPay(lowBasic, components, amount!.toString(), {}).lines.find(
          (l) => l.code === 'BASIC',
        )!.amount,
      ),
    ).toBeGreaterThanOrEqual(3000);
    const fixedAllowances = {
      ...lowBasic,
      lines: [
        { component: 'BASIC', formula: 'GROSS - 10000' },
        { component: 'HOUSE_RENT', formula: '10000' },
      ],
    };
    expect(amountFor(fixedAllowances, components, {}, 'BASIC', new Decimal(100))?.toString()).toBe(
      '10100',
    );
    const fixedBasic = {
      ...lowBasic,
      lines: [
        { component: 'BASIC', formula: '100' },
        { component: 'HOUSE_RENT', formula: 'GROSS - 100' },
      ],
    };
    expect(amountFor(fixedBasic, components, {}, 'BASIC', new Decimal(101))).toBeNull();
  });
  it('enforces the basic floor even with zero matrix increment above the grade maximum', () => {
    const result = compensationPay(before, '0', structure, components);
    expect(Number(result.basicAfter)).toBeGreaterThanOrEqual(7325);
    expect(Number(result.grossAfter)).toBeGreaterThan(12500);
    expect(result.percent).toBe('0');
  });
  it('rounds up to the whole-taka structure input without reducing pay', () => {
    const result = compensationPay(
      { ...before, minimumBasic: basic },
      '1.01',
      structure,
      components,
    );
    expect(Number(result.grossAfter)).toBeGreaterThanOrEqual(Number(pay.gross) * 1.0101);
    expect(Number(result.basicAfter)).toBeGreaterThanOrEqual(Number(basic));
  });
  it('checks the company total and unit subtotal with exact decimal money', () => {
    const budgets = [
      { orgUnitId: null, monthlyAmount: '0.30' },
      { orgUnitId: 'u1', monthlyAmount: '0.10' },
    ];
    const lines = [
      { orgUnitId: 'u1', grossBefore: '100', grossAfter: '100.10' },
      { orgUnitId: 'u2', grossBefore: '100', grossAfter: '100.20' },
    ];
    expect(budgetUse(budgets, lines)).toEqual([
      { ...budgets[0], proposed: '0.30', within: true },
      { ...budgets[1], proposed: '0.10', within: true },
    ]);
    expect(budgetUse([{ orgUnitId: null, monthlyAmount: '0.29' }], lines)[0]!.within).toBe(false);
  });
});
