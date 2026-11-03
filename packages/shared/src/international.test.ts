import { describe, it, expect } from 'vitest';
import {
  sumByCurrency,
  bankIdentifierSchema,
  legalProfileInputSchema,
  timeZoneSchema,
  statutoryProfileInputSchema,
} from './international.js';
import { zonedInstant, localParts } from './attendance.js';
import { hireEmployeeSchema } from './hr-schemas.js';
const id = '12345678-1234-4234-8234-123456789012';
describe('international boundaries', () => {
  it('keeps currencies separate with exact decimal arithmetic', () => {
    expect(
      sumByCurrency([
        { currency: 'AED', amount: '0.10' },
        { currency: 'AED', amount: '0.20' },
        { currency: 'BDT', amount: '20.00' },
        { currency: 'SAR', amount: '-0.01' },
      ]),
    ).toEqual([
      { currency: 'AED', amount: '0.30' },
      { currency: 'BDT', amount: '20.00' },
      { currency: 'SAR', amount: '-0.01' },
    ]);
    expect(() => sumByCurrency([{ currency: 'USD', amount: '1e3' }])).toThrow();
    expect(() => sumByCurrency([{ currency: 'XYZ', amount: '1.00' }])).toThrow();
  });
  it('validates IANA zones and rejects numeric offsets', () => {
    for (const z of ['Asia/Dhaka', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'UTC'])
      expect(timeZoneSchema.safeParse(z).success).toBe(true);
    for (const z of ['+04:00', 'Not/AZone', ''])
      expect(timeZoneSchema.safeParse(z).success).toBe(false);
  });
  it('keeps UTC instants independent of company date and display language', () => {
    const instant = new Date('2026-12-31T20:30:00Z');
    expect(localParts(instant, 'Asia/Dhaka').date).toBe('2027-01-01');
    expect(localParts(instant, 'Asia/Dubai').date).toBe('2027-01-01');
    expect(localParts(instant, 'Asia/Riyadh').date).toBe('2026-12-31');
  });
  it('rejects missing and ambiguous DST wall times, preserving ordinary overnight instants', () => {
    expect(() => zonedInstant('2026-03-29', '01:30', 'Europe/London')).toThrow(
      'nonexistent_local_time',
    );
    expect(() => zonedInstant('2026-10-25', '01:30', 'Europe/London')).toThrow(
      'ambiguous_local_time',
    );
    expect(zonedInstant('2027-01-01', '01:30', 'Asia/Dubai').toISOString()).toBe(
      '2026-12-31T21:30:00.000Z',
    );
  });
  it('cannot relabel an AE company as BDT or a different regime', () => {
    const profile = {
      legalEntityId: id,
      countryCode: 'AE',
      currency: 'AED',
      regime: 'AE_FEDERAL_PRIVATE',
      effectiveFrom: '2026-01-01',
      businessTimeZone: 'Asia/Dubai',
      calendar: 'gregorian',
      reason: 'Explicit company registration',
    };
    expect(legalProfileInputSchema.safeParse(profile).success).toBe(true);
    expect(legalProfileInputSchema.safeParse({ ...profile, currency: 'BDT' }).success).toBe(false);
  });
  it('preserves supplied Hijri dates only with source provenance', () => {
    const profile = {
      employeeId: id,
      effectiveFrom: '2026-01-01',
      citizenship: 'SA',
      insuranceClass: 'unreviewed',
      contractClass: 'fixed-term',
      originalName: 'Original name',
      suppliedHijriDate: '1448-06-22',
      reason: 'Original contract information',
    };
    expect(statutoryProfileInputSchema.safeParse(profile).success).toBe(false);
    expect(
      statutoryProfileInputSchema.parse({
        ...profile,
        calendarProvenance: 'Original contract; conversion not qualified',
      }).suppliedHijriDate,
    ).toBe('1448-06-22');
  });
  it('validates country-specific IBAN checksum and rejects cross-currency payment', () => {
    expect(
      bankIdentifierSchema.safeParse({
        country: 'AE',
        currency: 'AED',
        iban: 'AE070331234567890123456',
      }).success,
    ).toBe(true);
    expect(
      bankIdentifierSchema.safeParse({
        country: 'SA',
        currency: 'SAR',
        iban: 'SA0380000000608010167519',
      }).success,
    ).toBe(true);
    expect(
      bankIdentifierSchema.safeParse({
        country: 'AE',
        currency: 'BDT',
        iban: 'AE070331234567890123456',
      }).success,
    ).toBe(false);
    expect(
      bankIdentifierSchema.safeParse({
        country: 'AE',
        currency: 'AED',
        iban: 'AE070331234567890123457',
      }).success,
    ).toBe(false);
  });
  it('accepts foreign contact records without fabricated BD parents, address or identifier', () => {
    const address = { line: 'Street 1', district: 'Dubai', division: 'Dubai', countryCode: 'AE' };
    const input = {
      employmentCountry: 'AE',
      nationality: 'IN',
      employeeCode: 'AE-1',
      fullName: 'Original Name',
      dateOfBirth: '1990-01-01',
      gender: 'female',
      mobilePhone: '+971501234567',
      presentAddress: address,
      permanentAddress: address,
      identity: {},
      joinedOn: '2026-01-01',
      job: { legalEntityId: id, employmentType: 'permanent', workerCategory: 'staff' },
    };
    expect(hireEmployeeSchema.safeParse(input).success).toBe(true);
    expect(
      hireEmployeeSchema.safeParse({ ...input, employmentCountry: 'BD', nationality: 'BD' })
        .success,
    ).toBe(false);
  });
});
