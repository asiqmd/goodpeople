import { describe, expect, it } from 'vitest';
import { BD_DIVISIONS, normalizeBdMobile } from './bd.js';
import { addDays, ageOn, todayIn } from './dates.js';
import {
  addressSchema,
  hireEmployeeSchema,
  isAdolescentOn,
  jobChangeSchema,
  nomineesSchema,
  paymentAccountsSchema,
} from './hr-schemas.js';

const ENTITY = '7a1a3b0e-62b4-4f52-9d3f-3f1f1b6f2c11';
const address = { line: 'House 12, Road 5', district: 'Gazipur', division: 'dhaka' };
const hire = (overrides: Record<string, unknown> = {}) => ({
  employeeCode: 'E-0001',
  fullName: 'Rahima Akter',
  fatherName: 'Abdul Karim',
  motherName: 'Salma Begum',
  dateOfBirth: '1998-03-14',
  gender: 'female',
  mobilePhone: '01712345678',
  presentAddress: address,
  permanentAddress: address,
  identity: { nid: '1234567890' },
  joinedOn: '2026-11-01',
  job: { legalEntityId: ENTITY, employmentType: 'probationer', workerCategory: 'worker' },
  ...overrides,
});
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('Bangladesh reference data', () => {
  it('has 8 divisions and 64 districts', () => {
    expect(BD_DIVISIONS).toHaveLength(8);
    expect(BD_DIVISIONS.flatMap((d) => d.districts)).toHaveLength(64);
  });

  it('normalizes mobile numbers to +880 form', () => {
    expect(normalizeBdMobile('01712345678')).toBe('+8801712345678');
    expect(normalizeBdMobile('+8801712345678')).toBe('+8801712345678');
    expect(normalizeBdMobile('8801712345678')).toBe('+8801712345678');
  });

  it('rejects a district outside its division', () => {
    const result = addressSchema.safeParse({ ...address, district: 'Sylhet' });
    expect(messages(result)).toContain('This district is not in the selected division');
  });
});

describe('dates', () => {
  it('computes completed years', () => {
    expect(ageOn('2008-11-02', '2026-11-01')).toBe(17);
    expect(ageOn('2008-11-01', '2026-11-01')).toBe(18);
  });

  it('adds days across month ends without time-zone drift', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it("gives today's date in Dhaka", () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in Dhaka (UTC+6).
    expect(todayIn('Asia/Dhaka', new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
});

describe('hiring', () => {
  it('accepts a valid hire and normalizes the phone', () => {
    const result = hireEmployeeSchema.parse(hire());
    expect(result.mobilePhone).toBe('+8801712345678');
    expect(result.nationality).toBe('BD');
  });

  it('refuses anyone under 14 on the joining date', () => {
    expect(messages(hireEmployeeSchema.safeParse(hire({ dateOfBirth: '2013-01-01' })))).toContain(
      'Must be at least 14 on the joining date (Labour Act s.34)',
    );
  });

  it('flags adolescents (14–17)', () => {
    expect(isAdolescentOn('2010-01-01', '2026-11-01')).toBe(true);
    expect(isAdolescentOn('2000-01-01', '2026-11-01')).toBe(false);
  });

  it('needs at least one identity document', () => {
    expect(messages(hireEmployeeSchema.safeParse(hire({ identity: {} })))).toContain(
      'Give an NID, birth registration or passport number',
    );
  });

  it('validates Bangladesh identity formats', () => {
    const result = hireEmployeeSchema.safeParse(hire({ identity: { nid: '12345', tin: '12' } }));
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'An NID has 10, 13 or 17 digits',
        'A Bangladesh e-TIN has 12 digits',
      ]),
    );
  });
});

const change = (overrides: Record<string, unknown>) =>
  jobChangeSchema.safeParse({
    effectiveFrom: '2026-12-01',
    reason: 'Annual review',
    changes: {},
    ...overrides,
  });

describe('job changes', () => {
  it('requires a transfer to move the employee somewhere', () => {
    expect(messages(change({ event: 'transfer' }))).toContain(
      'A transfer changes the legal entity, location or org unit',
    );
  });

  it('requires a promotion to change designation or grade', () => {
    expect(
      messages(change({ event: 'promotion', changes: { workerCategory: 'staff' } })),
    ).toContain('A promotion changes the designation or grade');
  });

  it('allows a confirmation with no other change', () => {
    expect(change({ event: 'confirmation', changes: {} }).success).toBe(true);
  });
});

describe('nominees and payment accounts', () => {
  it('requires nominee shares to total 100%', () => {
    const nominee = { name: 'Karim Mia', relation: 'Father', sharePercent: 60 };
    expect(nomineesSchema.safeParse([nominee]).success).toBe(false);
    expect(
      nomineesSchema.safeParse([nominee, { ...nominee, name: 'Salma Begum', sharePercent: 40 }])
        .success,
    ).toBe(true);
    expect(nomineesSchema.safeParse([]).success).toBe(true);
  });

  it('requires exactly one primary account and valid MFS numbers', () => {
    const bkash = {
      method: 'mfs',
      provider: 'bkash',
      accountNumber: '01712345678',
      isPrimary: true,
    };
    expect(paymentAccountsSchema.safeParse([bkash]).success).toBe(true);
    expect(paymentAccountsSchema.safeParse([bkash, { ...bkash, provider: 'nagad' }]).success).toBe(
      false,
    );
    expect(
      messages(paymentAccountsSchema.safeParse([{ ...bkash, accountNumber: '12345' }])),
    ).toContain('Use the wallet mobile number');
  });

  it('requires bank details for bank accounts', () => {
    const result = paymentAccountsSchema.safeParse([{ method: 'bank', isPrimary: true }]);
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'Bank name is required',
        'Routing number is required',
        'Use 6–20 digits',
      ]),
    );
  });
});
