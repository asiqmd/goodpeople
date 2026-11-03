import {
  workforceFigures,
  type WorkforceInput,
  type WorkforceJob,
  type WorkforcePerson,
} from './workforce.js';
const person = (
  id: string,
  joinedOn = '2026-01-01',
  separatedOn: string | null = null,
): WorkforcePerson => ({ id, userId: null, joinedOn, separatedOn });
const job = (
  id: string,
  company = 'a',
  from = '2026-01-01',
  through: string | null = null,
): WorkforceJob => ({
  id: id + company + from,
  employeeId: id,
  legalEntityId: company,
  locationId: null,
  effectiveFrom: from,
  effectiveTo: through,
  managerId: null,
});
const input = (
  people: WorkforcePerson[],
  jobs: WorkforceJob[],
  extras: Partial<WorkforceInput> = {},
): WorkforceInput => ({
  people,
  jobs,
  companies: ['a', 'b'],
  asOf: '2026-10-31',
  locations: [],
  visible: () => true,
  includeUnassigned: true,
  ...extras,
});
const numbers = (v: ReturnType<typeof workforceFigures>, company = 'a') =>
  v.get(company)!.map((m) => m.value);

describe('recorded workforce.v1 arithmetic', () => {
  it('counts a valid empty authorized measurement as zero', () =>
    expect(numbers(workforceFigures(input([], [])))).toEqual([0, 0, 0]));
  it('counts service starts and completed leavers, excluding the separation day from closing headcount', () => {
    const v = workforceFigures(
      input(
        [
          person('old'),
          person('new', '2026-10-04'),
          person('left', '2026-01-01', '2026-10-31'),
          person('later', '2026-01-01', '2026-11-01'),
        ],
        [job('old'), job('new', 'a', '2026-10-04'), job('left'), job('later')],
      ),
    );
    expect(numbers(v)).toEqual([3, 1, 1]);
  });
  it('attributes a transfer to the new company without a new service join', () => {
    const v = workforceFigures(
      input(
        [person('x')],
        [job('x', 'a', '2026-01-01', '2026-10-14'), job('x', 'b', '2026-10-15')],
      ),
    );
    expect(numbers(v)).toEqual([0, 0, 0]);
    expect(numbers(v, 'b')).toEqual([1, 0, 0]);
  });
  it('attributes joining and leaving to their event companies even if different from closing company', () => {
    const v = workforceFigures(
      input(
        [person('x', '2026-10-01', '2026-10-30')],
        [job('x', 'a', '2026-10-01', '2026-10-14'), job('x', 'b', '2026-10-15')],
      ),
    );
    expect(numbers(v)).toEqual([0, 1, 0]);
    expect(numbers(v, 'b')).toEqual([0, 0, 1]);
  });
  it('does not fill a job gap with a first or latest job', () => {
    const v = workforceFigures(
      input(
        [person('x')],
        [job('x', 'a', '2026-01-01', '2026-10-29'), job('x', 'a', '2026-11-01')],
      ),
    );
    expect(numbers(v)).toEqual([null, 0, 0]);
    expect(v.get('a')![0]!.issues).toEqual(['missing_assignment']);
  });
  it('rejects overlapping assignments including a conflicting other-company job', () => {
    const v = workforceFigures(input([person('x')], [job('x'), job('x', 'b')]));
    expect(numbers(v)).toEqual([null, 0, 0]);
    expect(numbers(v, 'b')).toEqual([null, 0, 0]);
  });
  it('keeps unknown unassigned history visibly incomplete for an unrestricted reader', () =>
    expect(numbers(workforceFigures(input([person('x')], [])))).toEqual([null, 0, 0]));
  it('does not reveal unrelated gaps to a restricted company or relationship', () => {
    const v = workforceFigures(
      input([person('a'), person('hidden')], [job('a'), job('hidden', 'b', '2026-11-01')], {
        companies: ['a'],
        visible: (id) => id === 'a',
        includeUnassigned: false,
      }),
    );
    expect(numbers(v)).toEqual([1, 0, 0]);
  });
  it('does not widen a site filter or count a mismatched site as a valid zero', () => {
    const j = { ...job('x'), locationId: 'site-b' };
    const v = workforceFigures(
      input([person('x')], [j], {
        locations: [{ id: 'site-b', legalEntityId: 'b' }],
        locationId: 'site-b',
      }),
    );
    expect(numbers(v)).toEqual([null, 0, 0]);
    expect(v.get('a')![0]!.issues).toEqual(['invalid_location']);
  });
  it('counts historical site at event time rather than current location', () => {
    const v = workforceFigures(
      input(
        [person('x', '2026-10-01')],
        [
          { ...job('x', 'a', '2026-10-01', '2026-10-14'), locationId: 's1' },
          { ...job('x', 'a', '2026-10-15'), locationId: 's2' },
        ],
        {
          locationId: 's1',
          locations: [
            { id: 's1', legalEntityId: 'a' },
            { id: 's2', legalEntityId: 'a' },
          ],
        },
      ),
    );
    expect(numbers(v)).toEqual([0, 1, 0]);
  });
  it('supports leap days and excludes future service starts', () => {
    const v = workforceFigures(
      input(
        [person('leap', '2024-02-29'), person('future', '2024-03-01')],
        [job('leap', 'a', '2024-02-29'), job('future', 'a', '2024-03-01')],
        { asOf: '2024-02-29' },
      ),
    );
    expect(numbers(v)).toEqual([1, 1, 0]);
  });
});
