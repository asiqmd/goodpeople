import { describe, expect, it } from 'vitest';
import { offerSchema, sameName } from './offers.js';

describe('accepting an offer by name', () => {
  it('ignores case and spaces, nothing else', () => {
    expect(sameName('  ayesha   SIDDIKA ', 'Ayesha Siddika')).toBe(true);
    expect(sameName('আয়েশা  সিদ্দিকা', 'আয়েশা সিদ্দিকা')).toBe(true);
    expect(sameName('Ayesha Begum', 'Ayesha Siddika')).toBe(false);
    expect(sameName('Ayesha', 'Ayesha Siddika')).toBe(false);
  });
});

describe('an offer’s terms', () => {
  const terms = {
    applicationId: '00000000-0000-4000-8000-000000000001',
    legalEntityId: '00000000-0000-4000-8000-000000000002',
    employmentType: 'probationer',
    joiningOn: '2026-12-01',
    monthlyGross: '13000',
    expiresOn: '2026-11-10',
  };

  it('expires on or before the joining date, with pay above zero', () => {
    expect(offerSchema.safeParse(terms).success).toBe(true);
    const late = offerSchema.safeParse({ ...terms, expiresOn: '2026-12-02' });
    expect(late.error?.issues[0]?.path).toEqual(['expiresOn']);
    expect(offerSchema.safeParse({ ...terms, monthlyGross: '0' }).success).toBe(false);
  });
});
