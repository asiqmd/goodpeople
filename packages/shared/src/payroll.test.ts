import { describe, expect, it } from 'vitest';
import { addMonths } from './dates.js';
import { fiscalYearBounds, fiscalYearOf } from './payroll.js';

describe('fiscal years and months', () => {
  it('puts a date in its July-to-June year', () => {
    expect(fiscalYearOf('2026-10-25')).toBe('2026-27');
    expect(fiscalYearOf('2026-06-30')).toBe('2025-26');
    expect(fiscalYearOf('2026-07-01')).toBe('2026-27');
    expect(fiscalYearOf('2099-12-31')).toBe('2099-00');
    expect(fiscalYearBounds('2026-27')).toEqual({ start: '2026-07-01', end: '2027-06-30' });
  });

  it('adds months, keeping to the end of shorter months', () => {
    expect(addMonths('2025-10-25', 12)).toBe('2026-10-25');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });
});
