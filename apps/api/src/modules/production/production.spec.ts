import {
  operationRateProblem,
  productionBatchSchema,
  productionOperationSchema,
  productionQuantitySchema,
} from '@gp/shared';
import { checkRows, planChanges, type Entry } from './production-changes.js';
import {
  isProductionHeading,
  parseSheetDate,
  parseSheetQuantity,
  productionColumns,
} from './production-sheet.js';

const row = (
  n: number,
  employeeCode: string,
  date: string,
  operationCode = 'OP1',
  quantity = '10',
) => ({ row: n, employeeCode, date, operationCode, quantity });
const entry = (employeeId: string, quantity: number, date = '2026-09-01'): Entry => ({
  employeeId,
  operationId: 'o1',
  date,
  quantity,
});

describe('operation rates', () => {
  it('needs a piece rate, or a daily target with an incentive rate', () => {
    expect(operationRateProblem({ pieceRate: '1.25' })).toBeNull();
    expect(operationRateProblem({ dailyTarget: 100, incentiveRate: '0.5' })).toBeNull();
    expect(
      operationRateProblem({ pieceRate: '0', dailyTarget: 100, incentiveRate: '0.5' }),
    ).toBeNull();
    expect(operationRateProblem({})?.path).toBe('pieceRate');
    expect(operationRateProblem({ pieceRate: '1', dailyTarget: 100 })?.path).toBe('incentiveRate');
    expect(operationRateProblem({ incentiveRate: '1' })?.path).toBe('dailyTarget');
  });

  it('takes rates of zero or more with up to four decimals, and upper-cases codes', () => {
    const ok = productionOperationSchema.safeParse({
      code: 'sew-01',
      name: 'Side seam',
      pieceRate: 0.075,
    });
    expect(ok.success && ok.data).toMatchObject({ code: 'SEW-01', pieceRate: '0.075' });
    for (const pieceRate of ['-1', '1.23456', 'abc']) {
      expect(
        productionOperationSchema.safeParse({ code: 'A', name: 'Ab', pieceRate }).success,
      ).toBe(false);
    }
  });
});

describe('quantities', () => {
  it('reads empty as zero and refuses fractions and negatives', () => {
    expect(productionQuantitySchema.parse('')).toBe(0);
    expect(productionQuantitySchema.parse(null)).toBe(0);
    expect(productionQuantitySchema.parse('120')).toBe(120);
    for (const bad of ['1.5', '-3', 'ten', 200_000]) {
      expect(productionQuantitySchema.safeParse(bad).success).toBe(false);
    }
  });

  it('lists each worker once in a batch', () => {
    const employeeId = '7d1f2c4e-8a1b-4c3d-9e2f-1a2b3c4d5e6f';
    const result = productionBatchSchema.safeParse({
      date: '2026-09-01',
      operationId: employeeId,
      entries: [
        { employeeId, quantity: 1 },
        { employeeId, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('production sheets', () => {
  it('finds the columns by English or Bangla headings', () => {
    expect(productionColumns(['Emp ID', 'Date', 'Operation', 'Qty'])).toEqual({
      employeeCode: 0,
      date: 1,
      operationCode: 2,
      quantity: 3,
    });
    expect(productionColumns(['তারিখ', 'কর্মী কোড', 'পরিমাণ', 'অপারেশন কোড'])).toEqual({
      employeeCode: 1,
      date: 0,
      operationCode: 3,
      quantity: 2,
    });
    expect(isProductionHeading(['Production report', '', ''])).toBe(false);
    expect(isProductionHeading(['Employee code', 'Pieces'])).toBe(true);
  });

  it('reads dates as Bangladesh writes them, and only real ones', () => {
    expect(parseSheetDate('2026-09-07')).toBe('2026-09-07');
    expect(parseSheetDate('07/09/2026')).toBe('2026-09-07');
    expect(parseSheetDate('7-9-2026')).toBe('2026-09-07');
    expect(parseSheetDate('০৭.০৯.২০২৬')).toBe('2026-09-07');
    expect(parseSheetDate('46272')).toBe('2026-09-07');
    expect(parseSheetDate('2026-02-30')).toBeNull();
    expect(parseSheetDate('09/31/2026')).toBeNull();
    expect(parseSheetDate('tomorrow')).toBeNull();
  });

  it('reads pieces with Bangla digits and separators', () => {
    expect(parseSheetQuantity('১,২০০')).toBe(1200);
    expect(parseSheetQuantity('85.0')).toBe(85);
    expect(parseSheetQuantity('0')).toBe(0);
    expect(parseSheetQuantity('')).toBeNull();
    expect(parseSheetQuantity('8.5')).toBeNull();
    expect(parseSheetQuantity('-2')).toBeNull();
  });
});

describe('checking imported rows', () => {
  const people = {
    'MG-1': { id: 'e1', joinedOn: '2024-01-01', separatedOn: null },
    'MG-2': { id: 'e2', joinedOn: '2026-09-15', separatedOn: null },
  } as Record<string, { id: string; joinedOn: string; separatedOn: string | null }>;
  const lookup = {
    today: '2026-09-20',
    employee: (code: string) => people[code] ?? null,
    operation: (code: string) => (code === 'OP1' ? { id: 'o1' } : null),
  };

  it('keeps good rows and gives each bad row its first problem', () => {
    const { entries, problems } = checkRows(
      [
        row(1, 'MG-1', '2026-09-01'),
        row(2, 'MG-9', '2026-09-01'),
        row(3, 'MG-1', '2026-09-01', 'OP9'),
        row(4, 'MG-1', '31/09/2026'),
        row(5, 'MG-1', '2026-09-21'),
        row(6, 'MG-1', '2026-09-02', 'OP1', 'many'),
        row(7, 'MG-2', '2026-09-10'),
        row(8, 'MG-1', '01/09/2026'),
        row(9, 'MG-2', '2026-09-16', 'OP1', '0'),
      ],
      lookup,
    );
    expect(entries.map((e) => [e.source.row, e.employeeId, e.date, e.quantity])).toEqual([
      [1, 'e1', '2026-09-01', 10],
      [9, 'e2', '2026-09-16', 0],
    ]);
    expect(problems.map((p) => [p.row, p.code])).toEqual([
      [2, 'employee_unknown'],
      [3, 'operation_unknown'],
      [4, 'date_invalid'],
      [5, 'date_future'],
      [6, 'quantity_invalid'],
      [7, 'not_employed'],
      [8, 'duplicate_row'],
    ]);
  });
});

describe('planning changes', () => {
  it('saves changes, removes zeros and leaves what is already so', () => {
    const plan = planChanges([entry('a', 10), entry('b', 0), entry('c', 5), entry('d', 0)], {
      existing: new Map([
        ['b|o1|2026-09-01', 4],
        ['c|o1|2026-09-01', 5],
      ]),
      locked: new Map(),
      inactive: new Set(),
    });
    expect(plan.upserts.map((e) => e.employeeId)).toEqual(['a']);
    expect(plan.removals.map((e) => e.employeeId)).toEqual(['b']);
    expect(plan.unchanged.map((e) => e.employeeId)).toEqual(['c', 'd']);
    expect(plan.refused).toEqual([]);
  });

  it('refuses changes on locked days and new pieces on inactive operations', () => {
    const locked = new Map([['a', [{ start: '2026-08-01', end: '2026-08-31' }]]]);
    const plan = planChanges(
      [entry('a', 10, '2026-08-31'), entry('a', 10, '2026-09-01'), entry('b', 3), entry('c', 0)],
      {
        existing: new Map([
          ['a|o1|2026-08-31', 10],
          ['c|o1|2026-09-01', 2],
        ]),
        locked,
        inactive: new Set(['o1']),
      },
    );
    // Unchanged on a locked day is fine; removing from an inactive operation is too.
    expect(plan.unchanged.map((e) => e.date)).toEqual(['2026-08-31']);
    expect(plan.removals.map((e) => e.employeeId)).toEqual(['c']);
    expect(plan.refused.map((r) => [r.entry.employeeId, r.code])).toEqual([
      ['a', 'operation_inactive'],
      ['b', 'operation_inactive'],
    ]);
    const lockedPlan = planChanges([entry('a', 11, '2026-08-31')], {
      existing: new Map(),
      locked,
      inactive: new Set(),
    });
    expect(lockedPlan.refused.map((r) => r.code)).toEqual(['payroll_locked']);
  });
});
