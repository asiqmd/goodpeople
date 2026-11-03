import { describe, it, expect } from 'vitest';
import {
  learningSessionSchema,
  learningAttendanceSchema,
  trainingExpiry,
  trainingDueOn,
  trainingState,
} from './learning.js';
describe('learning dates and contracts', () => {
  it('uses inclusive expiry and clamps month ends and leap days', () => {
    expect(trainingExpiry('2026-11-01', 12)).toBe('2027-10-31');
    expect(trainingExpiry('2024-02-29', 12)).toBe('2025-02-27');
    expect(trainingExpiry('2026-01-31', 1)).toBe('2026-02-27');
    expect(trainingExpiry('2026-11-01', null)).toBeNull();
  });
  it('starts grace at the later of designation and policy dates', () => {
    expect(trainingDueOn('2026-01-01', '2026-02-01', 30)).toBe('2026-03-03');
    expect(trainingDueOn('2026-04-01', '2026-02-01', 0)).toBe('2026-04-01');
  });
  it('counts only completed, unrevoked certificates through their expiry date', () => {
    const c = { completedOn: '2026-01-01', expiresOn: '2026-10-31', revokedAt: null };
    expect(trainingState('2026-10-31', '2026-01-01', [c])).toBe('current');
    expect(trainingState('2026-11-01', '2026-01-01', [c])).toBe('overdue');
    expect(trainingState('2025-12-01', '2025-12-01', [c])).toBe('due');
    expect(trainingState('2026-10-01', '2026-01-01', [{ ...c, revokedAt: new Date() }])).toBe(
      'overdue',
    );
  });
  it('refuses reversed session times and duplicate attendance', () => {
    expect(learningSessionSchema.safeParse({}).success).toBe(false);
    const id = '00000000-0000-4000-8000-000000000001';
    expect(
      learningAttendanceSchema.safeParse({
        note: 'Checked register',
        attendance: [
          { employeeId: id, status: 'attended' },
          { employeeId: id, status: 'absent' },
        ],
      }).success,
    ).toBe(false);
  });
});
