import { describe, expect, it } from 'vitest';
import { BD_SERVICE_TDS, bdVatFor, bdVatOn } from './vat.js';

describe('VAT on a subscription', () => {
  it('charges IT-enabled services at 5% and other services at 15%, withheld at the same rate', () => {
    expect(bdVatFor('S099.10', '2026-10-25', { startup: false })).toMatchObject({
      rate: 5,
      vdsRate: 5,
      exempt: false,
    });
    expect(bdVatFor('S099.20', '2026-10-25', { startup: false })).toMatchObject({
      rate: 15,
      vdsRate: 15,
      exempt: false,
    });
  });

  it('exempts a registered startup from 1 July 2026 to 30 June 2035 only', () => {
    expect(bdVatFor('S099.20', '2026-07-01', { startup: true })).toMatchObject({
      rate: 0,
      vdsRate: 0,
      exempt: true,
    });
    expect(bdVatFor('S099.10', '2026-06-30', { startup: true }).exempt).toBe(false);
    expect(bdVatFor('S099.10', '2035-07-01', { startup: true }).rate).toBe(5);
  });

  it('carries the invoice thresholds and its law, for review', () => {
    expect(bdVatOn('2026-10-25')).toMatchObject({
      buyerDetailsAbove: 25_000,
      bankPaymentAbove: 100_000,
      vdsCreditPeriods: 6,
      status: 'needs_review',
      reference: { act: 'VAT and Supplementary Duty Act 2012' },
    });
    expect(() => bdVatOn('2025-06-30')).toThrow('No VAT rules');
    expect(BD_SERVICE_TDS).toMatchObject({ percent: 10, itesExemptUntil: '2027-06-30' });
  });
});
