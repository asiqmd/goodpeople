import type { CommitteeCheckView } from '@gp/shared';
import {
  checkCommittee,
  committeeRuleOn,
  isRequired,
  minutesLate,
  nextMeetingDue,
  sizeRange,
  termEndOf,
  unionMembersNeeded,
  workforceFor,
  type CommitteeFacts,
  type MemberFacts,
} from './committee-rules.js';

const TODAY = '2026-06-15';
const participation = committeeRuleOn('participation', TODAY)!.value;
const safety = committeeRuleOn('safety', TODAY)!.value;
const complaint = committeeRuleOn('complaint', TODAY)!.value;

const member = (over: Partial<MemberFacts> = {}): MemberFacts => ({
  side: 'worker',
  role: 'member',
  selection: 'elected',
  gender: 'male',
  fromOn: '2026-01-01',
  toOn: null,
  ...over,
});
const people = (n: number, over: Partial<MemberFacts> = {}) =>
  Array.from({ length: n }, () => member(over));
const facts = (over: Partial<CommitteeFacts>): CommitteeFacts => ({
  kind: 'participation',
  formedOn: '2026-01-01',
  endsOn: null,
  members: [],
  meetings: [],
  ...over,
});
const result = (checks: CommitteeCheckView[], code: CommitteeCheckView['code']) =>
  checks.find((c) => c.code === code);

const safetyBalance = (workers: number, employer: number) =>
  result(
    checkCommittee(
      facts({
        kind: 'safety',
        members: [...people(workers), ...people(employer, { side: 'employer' })],
      }),
      { rule: safety, workforce: 600, hasUnion: false, today: '2026-02-15' },
    ),
    'balance',
  )!.result;

describe('committee rules', () => {
  it('has a complaint committee only from the 2025 amendment', () => {
    expect(committeeRuleOn('complaint', '2025-11-16')).toBeNull();
    const rule = committeeRuleOn('complaint', '2025-11-17')!;
    expect(rule.reference.section).toBe('332A');
    expect(rule.value.womanChairAndMajority).toBe(true);
    expect(committeeRuleOn('other', TODAY)).toBeNull();
    expect(committeeRuleOn('participation', TODAY)!.reference.section).toBe('205');
    expect(committeeRuleOn('safety', TODAY)!.reference.section).toBe('90A');
  });

  it('counts workers for participation and safety, everyone for the complaint committee', () => {
    const count = { workers: 40, employees: 55 };
    expect(workforceFor('participation', count)).toBe(40);
    expect(workforceFor('safety', count)).toBe(40);
    expect(workforceFor('complaint', count)).toBe(55);
  });

  it('requires participation and safety committees from 50 workers, complaint everywhere', () => {
    expect(isRequired(participation, 49)).toBe(false);
    expect(isRequired(participation, 50)).toBe(true);
    expect(isRequired(safety, 50)).toBe(true);
    expect(isRequired(complaint, 0)).toBe(false);
    expect(isRequired(complaint, 1)).toBe(true);
    expect(isRequired(null, 500)).toBe(false);
  });

  it('sizes committees by the workforce table', () => {
    expect(sizeRange(participation, 50)).toEqual({ min: 6, max: 6 });
    expect(sizeRange(participation, 100)).toEqual({ min: 6, max: 6 });
    expect(sizeRange(participation, 101)).toEqual({ min: 6, max: 10 });
    expect(sizeRange(participation, 3000)).toEqual({ min: 6, max: 18 });
    expect(sizeRange(participation, 9000)).toEqual({ min: 6, max: 30 });
    expect(sizeRange(safety, 600)).toEqual({ min: 6, max: 8 });
    expect(sizeRange(safety, 5000)).toEqual({ min: 6, max: 12 });
    expect(sizeRange(complaint, 2000)).toEqual({ min: 5, max: 5 });
  });

  it('ends the term two years after formation; the complaint committee has none', () => {
    expect(termEndOf(participation, '2024-03-01')).toBe('2026-02-28');
    expect(termEndOf(safety, '2024-02-29')).toBe('2026-02-28');
    expect(termEndOf(safety, '2022-03-01')).toBe('2024-02-29');
    expect(termEndOf(complaint, '2026-01-01')).toBeNull();
  });

  it('checks a participation committee: in term, size, sides and how workers were chosen', () => {
    const balanced = facts({
      members: [...people(3), ...people(3, { side: 'employer', selection: 'nominated' })],
    });
    const ok = checkCommittee(balanced, {
      rule: participation,
      workforce: 80,
      hasUnion: false,
      today: '2026-02-15',
    });
    expect(ok.map((c) => [c.code, c.result])).toEqual([
      ['in_term', 'ok'],
      ['size', 'ok'],
      ['balance', 'ok'],
      ['workers_elected', 'ok'],
      ['meetings', 'ok'],
      ['minutes', 'ok'],
    ]);
    expect(result(ok, 'in_term')!.date).toBe('2027-12-31');

    // More employer members than workers', too big for 80 workers, and with a union the
    // workers' members are nominated by it.
    const lopsided = facts({
      members: [...people(2), ...people(5, { side: 'employer', selection: 'nominated' })],
    });
    const bad = checkCommittee(lopsided, {
      rule: participation,
      workforce: 80,
      hasUnion: true,
      today: '2026-02-15',
    });
    expect(result(bad, 'size')).toMatchObject({ result: 'fail', value: 7, min: 6, max: 6 });
    expect(result(bad, 'balance')).toMatchObject({ result: 'fail', value: 2, min: 5 });
    expect(result(bad, 'workers_nominated')).toMatchObject({ result: 'fail', value: 2 });

    // Members who have left do not count.
    const left = facts({ members: [...people(6), member({ toOn: '2026-02-01' })] });
    expect(
      result(
        checkCommittee(left, {
          rule: participation,
          workforce: 80,
          hasUnion: false,
          today: '2026-02-15',
        }),
        'size',
      ),
    ).toMatchObject({ result: 'ok', value: 6 });
  });

  it('wants equal sides on a safety committee', () => {
    expect(safetyBalance(4, 4)).toBe('ok');
    expect(safetyBalance(5, 3)).toBe('fail');
  });

  it('wants a woman chairing the complaint committee and women the majority', () => {
    const ctx = { rule: complaint, workforce: 300, hasUnion: false, today: TODAY };
    const good = checkCommittee(
      facts({
        kind: 'complaint',
        members: [
          member({ role: 'chair', gender: 'female' }),
          ...people(2, { gender: 'female' }),
          ...people(2),
        ],
      }),
      ctx,
    );
    expect(good.map((c) => [c.code, c.result])).toEqual([
      ['in_term', 'ok'],
      ['size', 'ok'],
      ['woman_chair', 'ok'],
      ['women_majority', 'ok'],
    ]);
    expect(result(good, 'women_majority')).toMatchObject({ value: 3, min: 3 });

    const manChairs = checkCommittee(
      facts({
        kind: 'complaint',
        members: [member({ role: 'chair' }), ...people(2, { gender: 'female' }), ...people(2)],
      }),
      ctx,
    );
    expect(result(manChairs, 'woman_chair')!.result).toBe('fail');
    expect(result(manChairs, 'women_majority')!.result).toBe('fail');

    // A member from outside has no recorded gender: the records cannot tell.
    const outsider = checkCommittee(
      facts({
        kind: 'complaint',
        members: [
          member({ role: 'chair', gender: null }),
          ...people(2, { gender: 'female' }),
          ...people(2),
        ],
      }),
      ctx,
    );
    expect(result(outsider, 'woman_chair')!.result).toBe('unknown');
    expect(result(outsider, 'women_majority')!.result).toBe('unknown');
    expect(
      result(checkCommittee(facts({ kind: 'complaint', members: people(5) }), ctx), 'woman_chair')!
        .result,
    ).toBe('fail');
  });

  it('wants a participation committee to meet every two months, a safety committee every three', () => {
    expect(nextMeetingDue(participation, '2026-01-10', null)).toBe('2026-03-10');
    expect(nextMeetingDue(participation, '2026-01-10', '2026-04-30')).toBe('2026-06-30');
    expect(nextMeetingDue(safety, '2026-01-10', '2026-04-30')).toBe('2026-07-30');
    expect(nextMeetingDue(complaint, '2026-01-10', null)).toBeNull();

    const committee = facts({ formedOn: '2026-01-10', members: people(6) });
    const ctx = { rule: participation, workforce: 60, hasUnion: false };
    expect(
      result(checkCommittee(committee, { ...ctx, today: '2026-03-10' }), 'meetings'),
    ).toMatchObject({
      result: 'ok',
      date: '2026-03-10',
      value: 59,
    });
    expect(
      result(checkCommittee(committee, { ...ctx, today: '2026-03-11' }), 'meetings')!.result,
    ).toBe('fail');
    // No meeting check once the term is over: the term is what needs seeing to.
    const ended = facts({ formedOn: '2023-01-10', meetings: [] });
    const checks = checkCommittee(ended, { ...ctx, today: TODAY });
    expect(result(checks, 'in_term')).toMatchObject({ result: 'fail', date: '2025-01-09' });
    expect(result(checks, 'meetings')).toBeUndefined();
  });

  it('wants the minutes with the Director of Labour within seven days', () => {
    expect(minutesLate('2026-03-08', null, '2026-03-08')).toBe(false);
    expect(minutesLate('2026-03-08', null, '2026-03-09')).toBe(true);
    expect(minutesLate('2026-03-08', '2026-03-08', '2026-04-01')).toBe(false);
    expect(minutesLate('2026-03-08', '2026-03-09', '2026-04-01')).toBe(true);
    expect(minutesLate(null, null, '2026-04-01')).toBe(false);

    const committee = facts({
      members: people(6),
      meetings: [
        { heldOn: '2026-03-01', minutesSentOn: '2026-03-05' },
        { heldOn: '2026-05-01', minutesSentOn: null },
      ],
    });
    const ctx = { rule: participation, workforce: 60, hasUnion: false };
    expect(
      result(checkCommittee(committee, { ...ctx, today: '2026-05-08' }), 'minutes'),
    ).toMatchObject({
      result: 'ok',
      value: 0,
      max: 7,
    });
    expect(
      result(checkCommittee(committee, { ...ctx, today: '2026-05-09' }), 'minutes'),
    ).toMatchObject({
      result: 'fail',
      value: 1,
    });
    // Safety committees have no minutes limit in the rules.
    expect(
      result(
        checkCommittee({ ...committee, kind: 'safety' }, { ...ctx, rule: safety, today: TODAY }),
        'minutes',
      ),
    ).toBeUndefined();
  });

  it('needs members for a union by the share of workers, then by the 2025 table', () => {
    expect(unionMembersNeeded(250, '2025-11-16')).toMatchObject({ required: 50 });
    expect(unionMembersNeeded(251, '2025-11-16').required).toBe(51);
    expect(unionMembersNeeded(250, '2025-11-17').required).toBe(20);
    expect(unionMembersNeeded(301, '2025-11-17').required).toBe(40);
    expect(unionMembersNeeded(1500, '2025-11-17').required).toBe(100);
    expect(unionMembersNeeded(4000, '2025-11-17').required).toBe(400);
    expect(unionMembersNeeded(4000, '2025-11-17').rule.reference.section).toBe('179');
  });
});
