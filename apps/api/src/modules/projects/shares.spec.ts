import { Decimal } from '@gp/shared';
import {
  monthsFrom,
  overAllocatedOn,
  plannedShares,
  sharesOf,
  splitAmount,
  timesheetShares,
  type PlannedAllocation,
} from './shares.js';

const plan = (fields: Partial<PlannedAllocation>): PlannedAllocation => ({
  projectId: 'p1',
  percent: '100',
  costKind: 'programme',
  fromOn: '2026-01-01',
  toOn: null,
  ...fields,
});
const fractions = (shares: { projectId: string; costKind: string; fraction: Decimal }[]) =>
  shares.map((s) => [s.projectId, s.costKind, s.fraction.toDecimalPlaces(6).toString()]);

describe('planned shares', () => {
  it('weights each share by the days it is in force within the month', () => {
    // 60% from 21 June: 10 of 30 days. 40% all month.
    const shares = plannedShares(
      [plan({ percent: '60', fromOn: '2026-06-21' }), plan({ projectId: 'p2', percent: '40' })],
      '2026-06',
    );
    expect(fractions(shares)).toEqual([
      ['p1', 'programme', '0.2'],
      ['p2', 'programme', '0.4'],
    ]);
  });

  it('adds up shares in the same project and kind, and leaves out shares not in force', () => {
    const shares = plannedShares(
      [
        plan({ percent: '50', toOn: '2026-02-14' }),
        plan({ percent: '30', fromOn: '2026-02-15', toOn: '2026-03-31' }),
        plan({ percent: '20', costKind: 'admin' }),
        plan({ projectId: 'p3', fromOn: '2026-03-01' }),
        plan({ projectId: 'p4', toOn: '2026-01-31' }),
      ],
      '2026-02',
    );
    // 50% × 14/28 + 30% × 14/28 = 0.4; admin 20% all month.
    expect(fractions(shares)).toEqual([
      ['p1', 'programme', '0.4'],
      ['p1', 'admin', '0.2'],
    ]);
  });

  it('never adds up to more than the whole salary', () => {
    const shares = plannedShares(
      [
        plan({ percent: '33.33', toOn: '2026-07-12' }),
        plan({ percent: '66.67' }),
        plan({ projectId: 'p2', percent: '33.33', fromOn: '2026-07-13' }),
      ],
      '2026-07',
    );
    const sum = shares.reduce((s, x) => s.plus(x.fraction), new Decimal(0));
    expect(sum.lessThanOrEqualTo(1)).toBe(true);
    expect(sum.toDecimalPlaces(10).toString()).toBe('1');
  });
});

describe('timesheet shares', () => {
  it('splits by hours over all hours, leaving hours on no project with the unit', () => {
    const shares = timesheetShares(
      [
        { projectId: 'p1', hours: '8' },
        { projectId: 'p1', hours: '4' },
        { projectId: 'p2', hours: '6' },
        { projectId: null, hours: '6' },
      ],
      [plan({ projectId: 'p2', costKind: 'admin', percent: '10' })],
      '2026-05',
    )!;
    expect(fractions(shares)).toEqual([
      ['p1', 'programme', '0.5'],
      ['p2', 'admin', '0.25'],
    ]);
    expect(shares.map((s) => s.hours?.toString())).toEqual(['12', '6']);
  });

  it('prefers an approved timesheet over the plan, unless it has no hours', () => {
    const allocations = [plan({ percent: '80' })];
    const actual = sharesOf(allocations, [{ projectId: 'p1', hours: '5' }], '2026-05');
    expect(actual.basis).toBe('timesheet');
    expect(fractions(actual.shares)).toEqual([['p1', 'programme', '1']]);

    const empty = sharesOf(allocations, [{ projectId: 'p1', hours: '0' }], '2026-05');
    expect(empty.basis).toBe('planned');
    expect(fractions(empty.shares)).toEqual([['p1', 'programme', '0.8']]);
    expect(sharesOf([], null, '2026-05')).toEqual({ basis: 'planned', shares: [] });
  });
});

describe('splitting an amount', () => {
  it('rounds to the paisa and puts the difference on the largest part', () => {
    const third = new Decimal(1).dividedBy(3);
    const { parts, rest } = splitAmount('100.00', [third, third]);
    expect([...parts, rest].map((p) => p.toFixed(2))).toEqual(['33.34', '33.33', '33.33']);

    const half = splitAmount('12345.67', [new Decimal('0.5')]);
    expect(half.parts[0]!.plus(half.rest).toFixed(2)).toBe('12345.67');
  });

  it('adds up exactly whatever the fractions, negative amounts included', () => {
    const fractionsOf = [new Decimal('0.123457'), new Decimal('0.333333'), new Decimal('0.2')];
    for (const amount of ['0.01', '1.00', '999.99', '-1234.57', '12500.00']) {
      const { parts, rest } = splitAmount(amount, fractionsOf);
      const sum = parts.reduce((s, p) => s.plus(p), rest);
      expect(sum.toFixed(2)).toBe(new Decimal(amount).toFixed(2));
      for (const p of [...parts, rest]) expect(p.decimalPlaces()).toBeLessThanOrEqual(2);
    }
  });

  it('keeps everything with the unit without shares, and nothing when shares are whole', () => {
    expect(splitAmount('500.00', []).rest.toFixed(2)).toBe('500.00');
    const whole = splitAmount('500.00', [new Decimal('0.6'), new Decimal('0.4')]);
    expect(whole.parts.map((p) => p.toFixed(2))).toEqual(['300.00', '200.00']);
    expect(whole.rest.isZero()).toBe(true);
  });
});

describe('allocations over 100%', () => {
  const existing = [
    { percent: '60', fromOn: '2026-01-01', toOn: '2026-06-30' },
    { percent: '30', fromOn: '2026-04-01', toOn: null },
  ];

  it('finds the first day the shares in force would pass 100%', () => {
    expect(overAllocatedOn(existing, { percent: '10', fromOn: '2026-01-01', toOn: null })).toBe(
      null,
    );
    expect(overAllocatedOn(existing, { percent: '20', fromOn: '2026-02-01', toOn: null })).toBe(
      '2026-04-01',
    );
    expect(
      overAllocatedOn(existing, { percent: '50', fromOn: '2026-02-01', toOn: '2026-03-31' }),
    ).toBe('2026-02-01');
    expect(overAllocatedOn(existing, { percent: '70', fromOn: '2026-07-01', toOn: null })).toBe(
      null,
    );
  });
});

describe('months', () => {
  it('lists the months of a period across a year end', () => {
    expect(monthsFrom('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsFrom('2026-03', '2026-03')).toEqual(['2026-03']);
  });
});
