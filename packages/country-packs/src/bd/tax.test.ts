import { describe, expect, it } from 'vitest';
import { bdSalaryTax, bdTaxYear, thresholdFor, type Taxpayer } from './tax.js';

const general: Taxpayer = {
  female: false,
  senior: false,
  disabled: false,
  thirdGender: false,
  freedomFighter: false,
  disabledDependants: 0,
  area: 'dhaka_chattogram_city',
};
const fy27 = bdTaxYear('2026-27')!;
const fy26 = bdTaxYear('2025-26')!;

describe('salary tax, income year 2026-27', () => {
  it('takes a third of salary off, up to Tk 5 lakh, then the bands above Tk 4 lakh', () => {
    const r = bdSalaryTax(fy27, { salary: 1_200_000, investment: 0, taxpayer: general });
    expect(r).toMatchObject({
      exemption: 400_000,
      taxableIncome: 800_000,
      threshold: 400_000,
      // 300,000 at 10% and 100,000 at 15%
      grossTax: 45_000,
      tax: 45_000,
    });
  });

  it('gives the rebate as the least of 3% of income, 10% of investment and Tk 7.5 lakh', () => {
    const r = bdSalaryTax(fy27, { salary: 1_200_000, investment: 100_000, taxpayer: general });
    expect(r).toMatchObject({ rebate: 10_000, tax: 35_000 });
    const big = bdSalaryTax(fy27, { salary: 1_200_000, investment: 5_000_000, taxpayer: general });
    // 3% of the taxable 800,000
    expect(big.rebate).toBe(24_000);
  });

  it('raises the threshold for women, disability and each disabled dependant', () => {
    expect(thresholdFor(fy27, { ...general, female: true })).toBe(450_000);
    expect(thresholdFor(fy27, { ...general, senior: true, disabled: true })).toBe(525_000);
    expect(thresholdFor(fy27, { ...general, freedomFighter: true })).toBe(550_000);
    expect(thresholdFor(fy27, { ...general, disabledDependants: 2 })).toBe(500_000);
    const woman = bdSalaryTax(fy27, {
      salary: 1_200_000,
      investment: 0,
      taxpayer: { ...general, female: true },
    });
    expect(woman.grossTax).toBe(37_500);
  });

  it('charges nothing at or below the threshold and Tk 5,000 at least just above it', () => {
    expect(bdSalaryTax(fy27, { salary: 500_000, investment: 0, taxpayer: general })).toMatchObject({
      exemption: 166_667,
      tax: 0,
      minimumTax: 0,
    });
    expect(bdSalaryTax(fy27, { salary: 620_000, investment: 0, taxpayer: general })).toMatchObject({
      grossTax: 1_333,
      minimumTax: 5_000,
      tax: 5_000,
    });
  });

  it('runs through every band to 30%', () => {
    const r = bdSalaryTax(fy27, { salary: 6_000_000, investment: 0, taxpayer: general });
    // 5,500,000 taxable; 5,100,000 over the threshold
    expect(r.grossTax).toBe(30_000 + 60_000 + 100_000 + 500_000 + 570_000);
  });

  it('has the year before with the larger rebate', () => {
    expect(fy26.rebate).toEqual({ ofTaxableIncome: 3, ofInvestment: 15, cap: 1_000_000 });
    expect(
      bdSalaryTax(fy26, { salary: 1_200_000, investment: 100_000, taxpayer: general }).rebate,
    ).toBe(15_000);
    expect(bdTaxYear('2027-28')).toBeUndefined();
  });
});
