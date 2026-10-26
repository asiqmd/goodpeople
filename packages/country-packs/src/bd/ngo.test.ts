import { describe, expect, it } from 'vitest';
import { bdForeignDonationsOn } from './ngo.js';

describe('foreign donations', () => {
  it('caps a project’s administration at 20% and keeps vouchers five years, citing the Act', () => {
    const rules = bdForeignDonationsOn('2026-10-27');
    expect(rules).toMatchObject({ adminCapPercent: 20, voucherYears: 5, status: 'needs_review' });
    expect(rules.adminCapReference).toEqual({
      act: 'Foreign Donations (Voluntary Activities) Regulation Act 2016',
      section: '6',
    });
    expect(() => bdForeignDonationsOn('2015-01-01')).toThrow('No foreign donation rules');
  });
});
