import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BD_PAY_COMPONENTS, BD_SALARY_STRUCTURES } from '@gp/country-packs';
import { addDays, ATTENDANCE_STATUSES, Decimal, type PayLineView } from '@gp/shared';
import { z } from 'zod';
import { minimumWageCheck, workOutPay } from '../pay-calc.js';
import {
  computeBonus,
  computePay,
  type EngineComponent,
  type EngineDay,
  type EnginePayRecord,
} from '../run-engine.js';

// Golden cases: one person-month per JSON file, with the payslip worked out by hand from the
// rules (README.md has the format). The engine must agree with every line and total to the taka.

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .toSorted();

const components: EngineComponent[] = BD_PAY_COMPONENTS.map((c) => ({ ...c, isActive: true }));
const componentCodes = new Set(components.map((c) => c.code));
const structures = new Map(BD_SALARY_STRUCTURES.map((s) => [s.code, s]));

// ── The fixture format ────────────────────────────────────────────────────────

const date = z.iso.date();
const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'an amount in taka as a string, e.g. "6700"' });
const rate = z.string().regex(/^\d+(\.\d+)?$/, { error: 'a percentage as a string, e.g. "7.5"' });
const componentCode = z
  .string()
  .refine((code) => componentCodes.has(code), { error: 'not a component of the BD pack' });
const byComponent = z.record(componentCode, amount);

const payRecord = z.strictObject({
  effectiveFrom: date,
  structure: z
    .string()
    .refine((code) => structures.has(code), { error: 'not a structure of the BD pack' }),
  amount,
  grade: z.string().optional(),
  fixed: byComponent.optional(),
});

const day = z.strictObject({
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  otHours: z.number().nonnegative().optional(),
  leaveDays: z.number().min(0).max(1).optional(),
  unpaidLeave: z.boolean().optional(),
  late: z.boolean().optional(),
});
const count = z.number().int().nonnegative().optional();
const summary = z.strictObject({
  absentDays: count,
  halfDays: count,
  unpaidLeaveDays: count,
  paidLeaveDays: count,
  lateDays: count,
  otHours: z.number().nonnegative().optional(),
});

const common = {
  name: z.string().min(1),
  source: z.string().min(1),
  knownDifference: z.string().min(1).optional(),
  joinedOn: date,
  pay: z.array(payRecord).min(1),
  working: z.array(z.string().min(1)).min(1),
};
const totals = { lines: byComponent, earnings: amount, deductions: amount, net: amount };

const payCase = z.strictObject({
  ...common,
  kind: z.literal('pay'),
  period: z.strictObject({ start: date, end: date }),
  today: date.optional(),
  separatedOn: date.nullable().optional(),
  worker: z.boolean(),
  attendance: z.union([
    z.null(),
    z.strictObject({ days: z.record(date, day) }),
    z.strictObject({ summary }),
  ]),
  inputs: byComponent.optional(),
  pf: z.strictObject({ employeeRate: rate, employerRate: rate }).nullable().optional(),
  loans: z
    .array(
      z.strictObject({
        loanId: z.string().min(1),
        component: z.enum(['ADVANCE', 'LOAN', 'PF_LOAN']),
        installment: amount,
        outstanding: amount,
      }),
    )
    .optional(),
  expected: z.strictObject({ ...totals, employerCost: amount.optional() }),
});

const bonusCase = z.strictObject({
  ...common,
  kind: z.literal('bonus'),
  bonus: z.strictObject({
    cutOff: date,
    percentOfBasic: z.number().positive(),
    minServiceMonths: z.number().int().nonnegative(),
  }),
  expected: z.strictObject({ ...totals, qualifies: z.boolean() }),
});

const fixtureSchema = z.discriminatedUnion('kind', [payCase, bonusCase]);
type Fixture = z.infer<typeof fixtureSchema>;
type PayCase = z.infer<typeof payCase>;

// ── Building the engine's input ───────────────────────────────────────────────

const recordOf = (r: Fixture['pay'][number]): EnginePayRecord => ({
  effectiveFrom: r.effectiveFrom,
  structure: structures.get(r.structure)!,
  amount: r.amount,
  fixed: r.fixed ?? {},
});

/** One attendance day per employed day, present unless the fixture says otherwise. */
function attendanceOf(f: PayCase): EngineDay[] | null {
  if (f.attendance === null) return null;
  const from = f.joinedOn > f.period.start ? f.joinedOn : f.period.start;
  const to = f.separatedOn && f.separatedOn < f.period.end ? f.separatedOn : f.period.end;
  const days = new Map<string, EngineDay>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.set(d, {
      date: d,
      status: 'present',
      overtimeMinutes: 0,
      leaveDays: 0,
      unpaidLeave: false,
      late: false,
    });
  }
  if ('days' in f.attendance) {
    for (const [on, d] of Object.entries(f.attendance.days)) {
      const target = days.get(on);
      if (!target) throw new Error(`attendance day ${on} is outside the employed days`);
      Object.assign(target, {
        status: d.status ?? 'present',
        overtimeMinutes: Math.round((d.otHours ?? 0) * 60),
        leaveDays: d.leaveDays ?? (d.status === 'on_leave' ? 1 : 0),
        unpaidLeave: d.unpaidLeave ?? false,
        late: d.late ?? false,
      });
    }
    return [...days.values()];
  }
  // A summary goes on the first employed days, in a fixed order; the dates do not change pay.
  const s = f.attendance.summary;
  const rest = [...days.values()];
  const take = (n: number | undefined, change: Partial<EngineDay>) => {
    for (let i = 0; i < (n ?? 0); i++) {
      const target = rest.shift();
      if (!target) throw new Error('the attendance summary has more days than were employed');
      Object.assign(target, change);
    }
  };
  take(s.absentDays, { status: 'absent' });
  take(s.halfDays, { status: 'half_day' });
  take(s.unpaidLeaveDays, { status: 'on_leave', leaveDays: 1, unpaidLeave: true });
  take(s.paidLeaveDays, { status: 'on_leave', leaveDays: 1 });
  if ((s.lateDays ?? 0) > rest.length) throw new Error('more late days than days present');
  for (const target of rest.slice(0, s.lateDays ?? 0)) target.late = true;
  const otDay = rest[0] ?? [...days.values()][0];
  if (s.otHours && otDay) otDay.overtimeMinutes = Math.round(s.otHours * 60);
  return [...days.values()];
}

interface Outcome {
  status: string;
  problems: string[];
  qualifies?: boolean;
  lines: PayLineView[];
  earnings: string;
  deductions: string;
  net: string;
  employerCost: string;
}

function run(f: Fixture): Outcome {
  if (f.kind === 'bonus') {
    const inForce = f.pay.filter((r) => r.effectiveFrom <= f.bonus.cutOff).at(-1);
    if (!inForce) throw new Error(`no pay in force on the cut-off ${f.bonus.cutOff}`);
    const result = computeBonus({
      record: recordOf(inForce),
      joinedOn: f.joinedOn,
      ...f.bonus,
      components,
    });
    return {
      status: result?.status ?? 'ok',
      problems: (result?.problems ?? []).map((p) => `${p.code}: ${p.message}`),
      qualifies: result !== null,
      lines: result?.lines ?? [],
      earnings: result?.earnings ?? '0',
      deductions: result?.deductions ?? '0',
      net: result?.net ?? '0',
      employerCost: result?.employerCost ?? '0',
    };
  }
  const result = computePay({
    periodStart: f.period.start,
    periodEnd: f.period.end,
    today: f.today ?? addDays(f.period.end, 1),
    joinedOn: f.joinedOn,
    separatedOn: f.separatedOn ?? null,
    worker: f.worker,
    records: f.pay.map(recordOf),
    attendance: attendanceOf(f),
    inputs: f.inputs ?? {},
    components,
    pf: f.pf ?? null,
    loans: f.loans ?? [],
  });
  return { ...result, problems: result.problems.map((p) => `${p.code}: ${p.message}`) };
}

// ── Checks ────────────────────────────────────────────────────────────────────

const taka = (value: string | undefined) =>
  new Decimal(value ?? 0).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** What is wrong with the fixture itself, before the engine is asked. */
function fixtureProblems(file: string, f: Fixture): string[] {
  const out: string[] = [];
  const working = f.working.join('\n');
  for (const code of Object.keys(f.expected.lines)) {
    if (!working.includes(code)) out.push(`${file}: the working does not show ${code}`);
  }
  for (const total of ['Earnings', 'Deductions', 'Net']) {
    if (!working.includes(total)) out.push(`${file}: the working does not show ${total}`);
  }
  for (const r of f.pay) {
    if (!r.grade) continue;
    const structure = structures.get(r.structure)!;
    const split = workOutPay(structure, components, r.amount, r.fixed ?? {});
    const check = minimumWageCheck(structure, r.grade, r.effectiveFrom, split);
    if (!check) out.push(`${file}: ${r.structure} has no wage grade ${r.grade}`);
    else if (!check.meets) {
      out.push(
        `${file}: Tk ${r.amount} is below grade ${r.grade}'s minimum ` +
          `(gross ${check.minimumGross}, basic ${check.minimumBasic})`,
      );
    }
  }
  return out;
}

/** Every way the engine's payslip differs from the hand-worked one, to the taka. */
function differences(file: string, f: Fixture, got: Outcome): string[] {
  const out: string[] = [];
  if (got.status !== 'ok') {
    out.push(`${file}: engine status ${got.status} (${got.problems.join('; ')})`);
  }
  if (f.kind === 'bonus' && got.qualifies !== f.expected.qualifies) {
    out.push(`${file}: bonus due expected ${f.expected.qualifies}, engine ${got.qualifies}`);
  }
  const compare = (what: string, expected: string | undefined, actual: string | undefined) => {
    const e = taka(expected);
    const a = taka(actual);
    if (!e.equals(a)) {
      out.push(
        `${file}: ${what} expected ${e.toFixed(0)}, engine ${actual === undefined ? 'no line' : a.toFixed(0)}`,
      );
    }
  };
  const actual = new Map(got.lines.map((l) => [l.code, l.amount]));
  for (const [code, value] of Object.entries(f.expected.lines)) {
    compare(code, value, actual.get(code));
  }
  for (const [code, value] of actual) {
    if (!(code in f.expected.lines) && !new Decimal(value).isZero()) {
      out.push(`${file}: ${code} expected no line, engine ${taka(value).toFixed(0)}`);
    }
  }
  compare('earnings', f.expected.earnings, got.earnings);
  compare('deductions', f.expected.deductions, got.deductions);
  compare('net', f.expected.net, got.net);
  if (f.kind === 'pay' && f.expected.employerCost !== undefined) {
    compare('employer cost', f.expected.employerCost, got.employerCost);
  }
  return out;
}

const titleOf = (file: string) => {
  try {
    const { name } = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { name?: unknown };
    return typeof name === 'string' ? `${file}: ${name}` : file;
  } catch {
    return file;
  }
};

describe('golden payroll cases', () => {
  it('has fixtures to run', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(titleOf(file), (ctx) => {
      const parsed = fixtureSchema.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      if (!parsed.success) {
        throw new Error(`${file} does not match the format:\n${z.prettifyError(parsed.error)}`);
      }
      const f = parsed.data;
      expect(fixtureProblems(file, f), `${file}: fixture`).toEqual([]);

      const found = differences(file, f, run(f));
      if (f.knownDifference) {
        if (found.length === 0) {
          throw new Error(
            `${file}: the engine now agrees with the hand working; remove knownDifference`,
          );
        }
        ctx.skip(`known difference: ${f.knownDifference} | ${found.join(' | ')}`);
      }
      expect(found, `${file}: engine against the hand working`).toEqual([]);
    });
  }
});
