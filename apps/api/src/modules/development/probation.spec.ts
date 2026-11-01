import { DEFAULT_COMPETENCIES } from '@gp/shared';
import {
  actedOn,
  probationEndOf,
  ratingsProblem,
  reviewDueOn,
  reviewWanted,
  stateOf,
  type ProbationNow,
} from './probation.js';

describe('probation reviews', () => {
  it('reads the probation end HR set, else the Act’s three months, or six for staff (s.4)', () => {
    expect(
      probationEndOf({ probationEndsOn: '2026-12-10', joinedOn: '2026-09-01' }, 'worker'),
    ).toBe('2026-12-10');
    expect(probationEndOf({ probationEndsOn: null, joinedOn: '2026-09-01' }, 'worker')).toBe(
      '2026-11-30',
    );
    expect(probationEndOf({ probationEndsOn: null, joinedOn: '2026-09-01' }, 'staff')).toBe(
      '2027-02-28',
    );
  });

  it('is asked for in the three weeks before the end, never after it', () => {
    const today = '2026-11-01';
    expect(reviewWanted('2026-11-22', today)).toBe(true);
    expect(reviewWanted('2026-11-01', today)).toBe(true);
    expect(reviewWanted('2026-11-23', today)).toBe(false);
    expect(reviewWanted('2026-10-31', today)).toBe(false);
  });

  it('is due a week before the end, or on the day asked when that is later', () => {
    expect(reviewDueOn('2026-11-22', '2026-11-01')).toBe('2026-11-15');
    expect(reviewDueOn('2026-11-05', '2026-11-01')).toBe('2026-11-01');
  });

  it('is due, then submitted, then acted on', () => {
    expect(stateOf({ submittedAt: null, acted: false })).toBe('due');
    expect(stateOf({ submittedAt: new Date(), acted: false })).toBe('submitted');
    expect(stateOf({ submittedAt: new Date(), acted: true })).toBe('acted');
    expect(stateOf({ submittedAt: null, acted: true })).toBe('acted');
  });

  it('counts as acted on once the person is confirmed, extended or leaves', () => {
    const still: ProbationNow = {
      status: 'active',
      confirmedOn: null,
      employmentType: 'probationer',
      endsOn: '2026-11-22',
      separated: false,
    };
    expect(actedOn('2026-11-22', still)).toBe(false);
    expect(actedOn('2026-11-22', { ...still, confirmedOn: '2026-11-20' })).toBe(true);
    expect(actedOn('2026-11-22', { ...still, employmentType: 'permanent' })).toBe(true);
    expect(actedOn('2026-11-22', { ...still, endsOn: '2027-02-22' })).toBe(true);
    expect(actedOn('2026-11-22', { ...still, separated: true })).toBe(true);
    expect(actedOn('2026-11-22', { ...still, status: 'separated' })).toBe(true);
  });

  it('needs one rating for each competency, and none for others', () => {
    const all = Object.fromEntries(DEFAULT_COMPETENCIES.map((c) => [c.key, 3]));
    expect(ratingsProblem(DEFAULT_COMPETENCIES, all)).toBeNull();
    const { safety: _, ...missing } = all;
    expect(ratingsProblem(DEFAULT_COMPETENCIES, missing)).toMatch(/Safety and compliance/);
    expect(ratingsProblem(DEFAULT_COMPETENCIES, { ...all, charm: 5 })).toMatch(/charm/);
  });
});
