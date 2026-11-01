import { reminderFor } from './review-jobs.service.js';

describe('review reminders', () => {
  it('reminds from three days before a step’s date, and again on the day', () => {
    expect(reminderFor('2027-01-15', '2027-01-11')).toBeNull();
    expect(reminderFor('2027-01-15', '2027-01-12')).toBe('soon');
    expect(reminderFor('2027-01-15', '2027-01-14')).toBe('soon');
    expect(reminderFor('2027-01-15', '2027-01-15')).toBe('due');
    expect(reminderFor('2027-01-15', '2027-01-16')).toBeNull();
    expect(reminderFor(null, '2027-01-15')).toBeNull();
  });
});
