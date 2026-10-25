import { BD_PAY_COMPONENTS, BD_SALARY_STRUCTURES } from '@gp/country-packs';
import type { AttendanceStatus } from '@gp/shared';
import {
  computePay,
  difference,
  type EngineComponent,
  type EngineDay,
  type EngineInput,
} from './run-engine.js';

const components: EngineComponent[] = BD_PAY_COMPONENTS.map((c) => ({ ...c, isActive: true }));
const rmg = BD_SALARY_STRUCTURES.find((s) => s.code === 'RMG_WORKER')!;
const staff = BD_SALARY_STRUCTURES.find((s) => s.code === 'STAFF')!;

/** Every day of October 2026 present, with exceptions. */
function october(exceptions: Record<string, Partial<EngineDay>> = {}): EngineDay[] {
  return Array.from({ length: 31 }, (_, i) => {
    const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
    return {
      date,
      status: 'present' as AttendanceStatus,
      overtimeMinutes: 0,
      leaveDays: 0,
      unpaidLeave: false,
      ...exceptions[date],
    };
  });
}

const base = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  today: '2026-11-03',
  joinedOn: '2024-01-01',
  separatedOn: null,
  worker: true,
  records: [{ effectiveFrom: '2026-01-01', structure: rmg, amount: '12500', fixed: {} }],
  attendance: october(),
  inputs: {},
  components,
  ...overrides,
});

const amounts = (result: ReturnType<typeof computePay>) =>
  Object.fromEntries(result.lines.map((l) => [l.code, l.amount]));

describe('the pay engine', () => {
  it('pays a full month as the structure splits it', () => {
    const result = computePay(base());
    expect(result.status).toBe('ok');
    expect(amounts(result)).toEqual({
      BASIC: '6700.00',
      HOUSE_RENT: '3350.00',
      MEDICAL: '750.00',
      CONVEYANCE: '450.00',
      FOOD: '1250.00',
    });
    expect(result).toMatchObject({
      earnings: '12500.00',
      deductions: '0.00',
      net: '12500.00',
      problems: [],
    });
    expect(result.variables).toMatchObject({
      periodDays: 31,
      employedDays: 31,
      paidDays: 31,
      workedDays: 31,
    });
  });

  it('pays overtime at twice the hourly basic, 208 hours to the month', () => {
    // 10 hours of overtime on a basic of 6,700: 6700 × 2 × 10 ÷ 208 = 644.23 → 644.
    const result = computePay(
      base({
        attendance: october({
          '2026-10-05': { overtimeMinutes: 360 },
          '2026-10-06': { overtimeMinutes: 240 },
        }),
      }),
    );
    expect(amounts(result).OVERTIME).toBe('644.00');
    expect(result.variables.otHours).toBe(10);
    expect(result.net).toBe('13144.00');
  });

  it('deducts absence on basic and leave without pay on gross', () => {
    const result = computePay(
      base({
        attendance: october({
          '2026-10-07': { status: 'absent' },
          '2026-10-08': { status: 'absent' },
          '2026-10-12': { status: 'half_day' },
          '2026-10-20': { status: 'on_leave', leaveDays: 1, unpaidLeave: true },
        }),
      }),
    );
    // Absence: 6700 ÷ 30 × 2.5 = 558.33 → 558. Unpaid leave: 12500 ÷ 30 × 1 = 416.67 → 417.
    expect(amounts(result)).toMatchObject({ ABSENCE: '558.00', UNPAID_LEAVE: '417.00' });
    expect(result.variables).toMatchObject({ absentDays: 2.5, unpaidLeaveDays: 1, paidDays: 27.5 });
    expect(result).toMatchObject({ deductions: '975.00', net: '11525.00' });
  });

  it('prorates a joiner by calendar days', () => {
    const result = computePay(
      base({
        joinedOn: '2026-10-16',
        records: [{ effectiveFrom: '2026-10-16', structure: rmg, amount: '12500', fixed: {} }],
      }),
    );
    // 16 of 31 days: 6700 × 16/31 = 3458.06 → 3458.
    expect(amounts(result).BASIC).toBe('3458.00');
    expect(result.variables.employedDays).toBe(16);
    expect(result.earnings).toBe('6452.00');
  });

  it('splits a month where the pay changed', () => {
    const result = computePay(
      base({
        records: [
          { effectiveFrom: '2026-01-01', structure: rmg, amount: '12500', fixed: {} },
          { effectiveFrom: '2026-10-21', structure: rmg, amount: '14150', fixed: {} },
        ],
      }),
    );
    // Basic 6,700 for 20 days and 7,800 for 11: 4322.58 + 2767.74 = 7090.32 → 7090.
    expect(amounts(result).BASIC).toBe('7090.00');
    // Overtime and absence use the pay in force at the end of the period.
  });

  it('lets an entered amount stand in for a formula, and adds entered components', () => {
    const result = computePay(
      base({ inputs: { OVERTIME: '1000', ARREARS: '1500', ADVANCE: '2000' } }),
    );
    expect(amounts(result)).toMatchObject({
      OVERTIME: '1000.00',
      ARREARS: '1500.00',
      ADVANCE: '2000.00',
    });
    expect(result.net).toBe('13000.00');
  });

  it('pays overtime to workers only, as the Labour Act does', () => {
    const late = october({ '2026-10-05': { overtimeMinutes: 600 } });
    const worker = computePay(base({ attendance: late }));
    expect(worker.lines.find((l) => l.code === 'OVERTIME')?.amount).toBe('644.00');
    const officer = computePay(base({ attendance: late, worker: false }));
    expect(officer.lines.find((l) => l.code === 'OVERTIME')).toBeUndefined();
    expect(officer.variables.otHours).toBe(10);
  });

  it('works without attendance, paying every employed day', () => {
    const result = computePay(
      base({
        records: [
          {
            effectiveFrom: '2026-01-01',
            structure: staff,
            amount: '50000',
            fixed: { SPECIAL: '2500' },
          },
        ],
        attendance: null,
      }),
    );
    expect(result.problems).toEqual([]);
    expect(result.net).toBe('52500.00');
  });

  it('warns about what needs a look, and refuses what cannot be paid', () => {
    const warned = computePay(
      base({
        today: '2026-10-25',
        attendance: october({ '2026-10-10': { status: 'missing_punch' } }),
      }),
    );
    expect(warned.status).toBe('ok');
    expect(warned.problems.map((p) => p.code)).toEqual(['missing_punches', 'period_not_over']);

    // Days nobody processed hold the run back once the period is over.
    const gaps = october().filter((d) => d.date !== '2026-10-12' && d.date !== '2026-10-13');
    const early = computePay(base({ today: '2026-10-25', attendance: gaps }));
    expect(early.problems[0]).toMatchObject({
      code: 'not_processed',
      severity: 'warning',
      count: 2,
    });
    const late = computePay(base({ attendance: gaps }));
    expect(late).toMatchObject({
      status: 'error',
      problems: [{ code: 'not_processed', count: 2 }],
    });
    // Nothing is expected before tracking began.
    expect(
      computePay(base({ attendance: october().slice(14), trackingFrom: '2026-10-15' })).problems,
    ).toEqual([]);

    expect(computePay(base({ records: [] })).problems[0]!.code).toBe('no_pay');
    const negative = computePay(base({ inputs: { ADVANCE: '20000' } }));
    expect(negative).toMatchObject({ status: 'error', net: '-7500.00' });
    expect(negative.problems.map((p) => p.code)).toEqual(['negative_net']);
  });

  it('reports a run formula that cannot be worked out', () => {
    const broken = components.map((c) =>
      c.code === 'OVERTIME' ? { ...c, runFormula: 'MISSING * 2' } : c,
    );
    const result = computePay(base({ components: broken }));
    expect(result.status).toBe('error');
    expect(result.problems[0]!.message).toContain('OVERTIME');
  });

  it('gives an adjustment the difference per component', () => {
    const before = computePay(base()).lines;
    const after = computePay(
      base({
        inputs: { ARREARS: '500' },
        records: [{ effectiveFrom: '2026-01-01', structure: rmg, amount: '13025', fixed: {} }],
      }),
    ).lines;
    expect(Object.fromEntries(difference(before, after).map((l) => [l.code, l.amount]))).toEqual({
      BASIC: '350.00',
      HOUSE_RENT: '175.00',
      ARREARS: '500.00',
    });
  });
});
