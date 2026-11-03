import { describe, it, expect } from 'vitest';
import { countryManifest } from './registry.js';
const context = {
  countryCode: 'BD',
  regime: 'BD_PRIVATE',
  currency: 'BDT',
  calendar: 'gregorian',
  date: '2026-11-01',
};
describe('country rule dispatch', () => {
  it('snapshots stable rule source hashes without inventing a reviewer', () => {
    const result = countryManifest(context);
    expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rules.length).toBeGreaterThan(10);
    expect(
      result.rules.every((r) => r.reviewer === null && r.sourceVersionHash.length === 64),
    ).toBe(true);
    expect(countryManifest(context)).toEqual(result);
  });
  it.each([
    { countryCode: 'AE', currency: 'AED', regime: 'AE_FEDERAL_PRIVATE' },
    { countryCode: 'SA', currency: 'SAR', regime: 'SA_PRIVATE' },
    { calendar: 'hijri_required' },
    { date: '1800-01-01' },
  ])('blocks unsupported context %j', (change) =>
    expect(() => countryManifest({ ...context, ...change })).toThrow(),
  );
});
