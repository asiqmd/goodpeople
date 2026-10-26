import { describe, expect, it } from 'vitest';
import {
  timesheetEntriesSchema,
  timesheetHoursSchema,
  timesheetSubmitSchema,
} from './timesheets.js';

describe('timesheet schemas', () => {
  it('reads hours as numbers or text, to two decimals and at most 24', () => {
    expect(timesheetHoursSchema.parse(7.5)).toBe(7.5);
    expect(timesheetHoursSchema.parse(' 8 ')).toBe(8);
    expect(timesheetHoursSchema.parse('')).toBe(0);
    expect(timesheetHoursSchema.parse(null)).toBe(0);
    expect(timesheetHoursSchema.parse('0.25')).toBe(0.25);
    for (const bad of [24.5, -1, '7.125', 'seven']) {
      expect(timesheetHoursSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('takes a month of entries, a project or none for each', () => {
    const parsed = timesheetEntriesSchema.parse({
      month: '2026-10',
      entries: [{ date: '2026-10-05', hours: 6 }],
    });
    expect(parsed.entries[0]).toEqual({ date: '2026-10-05', projectId: null, hours: 6 });
    expect(timesheetEntriesSchema.safeParse({ month: '2026-13', entries: [] }).success).toBe(false);
  });

  it('submits only with the declaration', () => {
    expect(timesheetSubmitSchema.safeParse({ month: '2026-10', declaration: true }).success).toBe(
      true,
    );
    expect(timesheetSubmitSchema.safeParse({ month: '2026-10', declaration: false }).success).toBe(
      false,
    );
  });
});
