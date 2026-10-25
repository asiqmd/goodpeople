import {
  Decimal,
  RECONCILE_TOTALS,
  type ReconciliationColumn,
  type ReconciliationDifference,
  type ReconciliationMapping,
  type ReconciliationSummary,
} from '@gp/shared';

// Comparing a run with the payroll it replaces, person by person and column by column. Money
// matches when it agrees to the taka; days and hours when they agree to two decimals.

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** A heading reduced to letters and digits, for matching however a sheet spells it. */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');

/** Headings other payrolls commonly use, beyond each component's own code and names. */
const ALIASES: Record<string, string[]> = {
  BASIC: ['basic', 'basicsalary', 'basicpay', 'basicwage'],
  HOUSE_RENT: ['hra', 'houserentallowance', 'houserent'],
  MEDICAL: ['medical', 'medicalallowance'],
  CONVEYANCE: ['transport', 'transportallowance', 'conveyanceallowance'],
  FOOD: ['food', 'foodallowance', 'tiffin'],
  OVERTIME: ['ot', 'otamount', 'otpay', 'overtimeamount', 'overtimepay'],
  ATTENDANCE_BONUS: ['attendancebonus', 'attbonus'],
  ABSENCE: ['absentdeduction', 'absence', 'absentamount'],
  ADVANCE: ['advance', 'advancededuction', 'salaryadvance'],
  PF_EMPLOYEE: ['pf', 'pfdeduction', 'providentfund', 'pfcontribution'],
  TAX: ['tax', 'incometax', 'tds', 'ait', 'taxdeduction'],
  GROSS: ['gross', 'grosssalary', 'grosspay', 'grosswage', 'মোটবেতন'],
  EARNINGS: ['totalearnings', 'totalearning', 'grossearnings', 'totalpayable', 'totalsalary'],
  DEDUCTIONS: ['totaldeduction', 'totaldeductions', 'deduction', 'deductions'],
  NET: ['net', 'netpay', 'netsalary', 'netpayable', 'netamount', 'নিটবেতন'],
  PAID_DAYS: ['paiddays', 'payabledays', 'payday', 'paydays'],
  ABSENT_DAYS: ['absentdays', 'absent', 'absentday'],
  OT_HOURS: ['othours', 'othour', 'overtimehours', 'othrs'],
};
const CODE_HEADINGS = [
  'code',
  'id',
  'empid',
  'employeeid',
  'employeecode',
  'idno',
  'cardno',
  'empcode',
  'কোড',
  'আইডি',
];
const NAME_HEADINGS = ['name', 'employeename', 'fullname', 'নাম'];

/** Whether a row looks like the heading row: it names an employee code column. */
export const isHeading = (cells: string[]) =>
  cells.some((c) => CODE_HEADINGS.some((h) => normalize(h) === normalize(c)));

export interface ComparedComponent {
  code: string;
  name: string;
  nameBn: string | null;
}

/**
 * Proposes which heading holds what. The last mapping used is kept where its headings are
 * still there; otherwise headings are matched to codes, names and common spellings.
 */
export function suggestMapping(
  headers: string[],
  components: readonly ComparedComponent[],
  previous: ReconciliationMapping | null,
): ReconciliationMapping {
  const has = new Set(headers);
  if (previous && has.has(previous.employeeCode)) {
    const columns = Object.fromEntries(
      Object.entries(previous.columns).filter(([, h]) => has.has(h)),
    );
    if (Object.keys(columns).length) {
      return {
        employeeCode: previous.employeeCode,
        ...(previous.name && has.has(previous.name) ? { name: previous.name } : {}),
        columns,
      };
    }
  }
  const byHeading = new Map(headers.map((h) => [normalize(h), h]));
  const find = (candidates: string[]) =>
    candidates.map((c) => byHeading.get(normalize(c))).find((h) => h !== undefined);
  const columns: Record<string, string> = {};
  const taken = new Set<string>();
  const take = (key: string, candidates: string[]) => {
    const heading = find(candidates);
    if (heading && !taken.has(heading)) {
      columns[key] = heading;
      taken.add(heading);
    }
  };
  for (const key of RECONCILE_TOTALS) take(key, [key, ...(ALIASES[key] ?? [])]);
  for (const c of components) {
    take(c.code, [c.code, c.name, ...(c.nameBn ? [c.nameBn] : []), ...(ALIASES[c.code] ?? [])]);
  }
  const code = find(CODE_HEADINGS) ?? headers[0] ?? '';
  const name = find(NAME_HEADINGS);
  return { employeeCode: code, ...(name ? { name } : {}), columns };
}

/**
 * An amount as a sheet writes it: thousands separators, taka signs, Bangla digits, and
 * negatives in brackets. Empty or a dash is nothing; anything else unreadable is null.
 */
export function parseAmount(text: string): Decimal | null {
  const t = text
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/৳|tk\.?|bdt/gi, '')
    .replace(/[,\s]/g, '');
  if (t === '' || t === '-') return new Decimal(0);
  const negative = /^\(.*\)$/.test(t);
  const body = negative ? t.slice(1, -1) : t;
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const value = new Decimal(body);
  return negative ? value.negated() : value;
}

const COUNTS = new Set(['PAID_DAYS', 'ABSENT_DAYS', 'OT_HOURS']);
/** Money to the taka; days and hours to two decimals. */
const precision = (key: string) => (COUNTS.has(key) ? 2 : 0);
const show = (_key: string, d: Decimal) => d.toFixed(2);

export interface OurPerson {
  employeeId: string;
  employeeCode: string;
  name: string;
  values: Map<string, Decimal>;
}

export interface Comparison {
  summary: ReconciliationSummary;
  columns: ReconciliationColumn[];
  differences: ReconciliationDifference[];
}

/** Their people against ours, for the mapped columns. */
export function compareSheet(
  sheet: { headers: string[]; rows: string[][] },
  mapping: ReconciliationMapping,
  ours: OurPerson[],
  labelOf: (key: string) => string,
): Comparison {
  const column = (heading: string) => sheet.headers.indexOf(heading);
  const codeAt = column(mapping.employeeCode);
  const nameAt = mapping.name ? column(mapping.name) : -1;
  const keys = Object.keys(mapping.columns);
  const theirs = new Map<
    string,
    { code: string; name: string | null; values: Map<string, Decimal> }
  >();
  for (const row of sheet.rows) {
    const code = row[codeAt]?.trim();
    if (!code) continue;
    const person = theirs.get(code.toLowerCase()) ?? {
      code,
      name: nameAt >= 0 ? row[nameAt] || null : null,
      values: new Map<string, Decimal>(),
    };
    // A person on several rows (split across sections) is added up.
    for (const key of keys) {
      const amount = parseAmount(row[column(mapping.columns[key]!)] ?? '') ?? new Decimal(0);
      person.values.set(key, (person.values.get(key) ?? new Decimal(0)).plus(amount));
    }
    theirs.set(code.toLowerCase(), person);
  }

  const totals = new Map(
    keys.map((k) => [
      k,
      { matched: 0, differing: 0, ours: new Decimal(0), theirs: new Decimal(0) },
    ]),
  );
  const differences: ReconciliationDifference[] = [];
  const summary: ReconciliationSummary = {
    people: 0,
    matched: 0,
    differing: 0,
    onlyOurs: 0,
    onlyTheirs: 0,
  };
  const ourCodes = new Set<string>();
  for (const p of ours) {
    const code = p.employeeCode.toLowerCase();
    ourCodes.add(code);
    summary.people += 1;
    const their = theirs.get(code);
    const value = (key: string) => p.values.get(key) ?? new Decimal(0);
    if (!their) {
      summary.onlyOurs += 1;
      for (const key of keys) totals.get(key)!.ours = totals.get(key)!.ours.plus(value(key));
      differences.push({
        employeeCode: p.employeeCode,
        name: p.name,
        employeeId: p.employeeId,
        status: 'only_ours',
        lines: keys.map((key) => ({
          key,
          ours: show(key, value(key)),
          theirs: null,
          difference: show(key, value(key)),
        })),
      });
      continue;
    }
    const lines: ReconciliationDifference['lines'] = [];
    for (const key of keys) {
      const a = value(key);
      const b = their.values.get(key) ?? new Decimal(0);
      const t = totals.get(key)!;
      t.ours = t.ours.plus(a);
      t.theirs = t.theirs.plus(b);
      const places = precision(key);
      const same = a
        .toDecimalPlaces(places, Decimal.ROUND_HALF_UP)
        .equals(b.toDecimalPlaces(places, Decimal.ROUND_HALF_UP));
      if (same) t.matched += 1;
      else {
        t.differing += 1;
        lines.push({
          key,
          ours: show(key, a),
          theirs: show(key, b),
          difference: show(key, a.minus(b)),
        });
      }
    }
    if (lines.length) {
      summary.differing += 1;
      differences.push({
        employeeCode: p.employeeCode,
        name: p.name,
        employeeId: p.employeeId,
        status: 'differs',
        lines,
      });
    } else summary.matched += 1;
  }
  for (const [code, their] of theirs) {
    if (ourCodes.has(code)) continue;
    summary.people += 1;
    summary.onlyTheirs += 1;
    for (const key of keys)
      totals.get(key)!.theirs = totals.get(key)!.theirs.plus(their.values.get(key) ?? 0);
    differences.push({
      employeeCode: their.code,
      name: their.name,
      employeeId: null,
      status: 'only_theirs',
      lines: keys.map((key) => {
        const b = their.values.get(key) ?? new Decimal(0);
        return { key, ours: null, theirs: show(key, b), difference: show(key, b.negated()) };
      }),
    });
  }
  return {
    summary,
    columns: keys.map((key) => {
      const t = totals.get(key)!;
      return {
        key,
        label: labelOf(key),
        matched: t.matched,
        differing: t.differing,
        ours: show(key, t.ours),
        theirs: show(key, t.theirs),
      };
    }),
    differences,
  };
}

/**
 * Months in a row, newest first, in which every pay group's run matched. The newest months
 * may not have been compared yet; the streak runs back from the first month that was.
 */
export function matchedInARow(months: { period: string; status: string | null }[]): number {
  let streak = 0;
  for (const period of new Set(months.map((m) => m.period))) {
    const runs = months.filter((m) => m.period === period);
    if (streak === 0 && runs.every((m) => m.status === null)) continue;
    if (!runs.every((m) => m.status === 'matched')) break;
    streak += 1;
  }
  return streak;
}
