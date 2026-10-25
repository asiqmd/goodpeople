import {
  GRIEVANCE_REFERENCE_ALPHABET,
  grievancePinSchema,
  grievanceReferenceSchema,
  isGrievanceReference,
} from '@gp/shared';
import { newGrievanceReference, PinLockout } from './codes.js';

const MINUTE = 60_000;

describe('grievance references', () => {
  it('look like GR-7K3P9Q, from characters that cannot be misread', () => {
    const references = Array.from({ length: 500 }, newGrievanceReference);
    for (const reference of references) {
      expect(reference).toMatch(/^GR-[A-Z0-9]{6}$/);
      expect(isGrievanceReference(reference)).toBe(true);
      expect(reference.slice(3)).not.toMatch(/[01ILOUV]/);
    }
    expect(new Set(references).size).toBeGreaterThan(495);
    expect(GRIEVANCE_REFERENCE_ALPHABET).not.toMatch(/[01ILOUV]/);
  });

  it('are read however they were typed', () => {
    for (const typed of ['GR-7K3P9Q', 'gr-7k3p9q', ' GR 7K3P 9Q ', 'GR7K3P9Q', '7k3p9q']) {
      expect(grievanceReferenceSchema.parse(typed)).toBe('GR-7K3P9Q');
    }
    // Six characters that start with G and R are a reference body, not the prefix.
    expect(grievanceReferenceSchema.parse('GRABCD')).toBe('GR-GRABCD');
    for (const wrong of ['GR-7K3P9', 'GR-7K3P9QX', 'GR-0K3P9Q', 'XY-7K3P9Q', '']) {
      expect(grievanceReferenceSchema.safeParse(wrong).success).toBe(false);
    }
  });
});

describe('grievance PINs', () => {
  it('are 4 to 8 digits, typed in English or Bangla digits', () => {
    expect(grievancePinSchema.parse('2468')).toBe('2468');
    expect(grievancePinSchema.parse(' 12345678 ')).toBe('12345678');
    expect(grievancePinSchema.parse('২৪৬৮')).toBe('2468');
    for (const wrong of ['123', '123456789', '12a4', '12 34', '']) {
      expect(grievancePinSchema.safeParse(wrong).success).toBe(false);
    }
  });

  it('lock a reference for 15 minutes after five wrong ones', () => {
    const lockout = new PinLockout();
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) expect(lockout.fail('r', t0 + i)).toBe(0);
    expect(lockout.lockedFor('r', t0 + 5)).toBe(0);
    expect(lockout.fail('r', t0 + 5)).toBe(15 * 60);
    expect(lockout.lockedFor('r', t0 + 14 * MINUTE)).toBeGreaterThan(0);
    expect(lockout.lockedFor('other', t0 + 6)).toBe(0);
    // Then five more tries.
    const opened = t0 + 5 + 15 * MINUTE;
    expect(lockout.lockedFor('r', opened)).toBe(0);
    for (let i = 0; i < 4; i++) expect(lockout.fail('r', opened + i)).toBe(0);
  });

  it('forget wrong ones after a right one, or once the window has passed', () => {
    const lockout = new PinLockout();
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) lockout.fail('r', t0);
    lockout.clear('r');
    expect(lockout.fail('r', t0)).toBe(0);
    for (let i = 0; i < 3; i++) lockout.fail('r', t0);
    expect(lockout.fail('r', t0 + 16 * MINUTE)).toBe(0);
  });
});
