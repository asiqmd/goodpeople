import { bdWageBoard } from '@gp/country-packs';
import {
  Decimal,
  evaluateLines,
  money,
  type LineProblem,
  type MinimumWageCheck,
  type PayBasis,
  type PayLineView,
} from '@gp/shared';

/** What working out a salary needs to know about each component. */
export interface ComponentInfo {
  code: string;
  name: string;
  nameBn: string | null;
  kind: PayLineView['kind'];
  calculation: 'structure' | 'fixed' | 'run';
  inGross: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface StructureInfo {
  basis: PayBasis;
  lines: { component: string; formula: string }[];
  wageBoard: string | null;
}

export interface PayResult {
  lines: PayLineView[];
  gross: string;
  problems: LineProblem[];
}

/** The name a structure's input goes by: the gross it splits, or the basic it builds on. */
export const inputName = (basis: PayBasis) => (basis === 'gross' ? 'GROSS' : 'BASIC');

/**
 * A salary's components: the structure's lines from the gross or basic, plus fixed amounts.
 * Gross is everything counted in gross. Problems (a bad formula, an unknown component, a
 * negative amount) leave the lines empty.
 */
export function workOutPay(
  structure: StructureInfo,
  components: readonly ComponentInfo[],
  amount: string,
  fixed: Readonly<Record<string, string>> = {},
  options: { allowNegative?: boolean } = {},
): PayResult {
  const byCode = new Map(components.map((c) => [c.code, c]));
  const problems: LineProblem[] = [];
  for (const line of structure.lines) {
    const c = byCode.get(line.component);
    if (!c)
      problems.push({ code: line.component, message: `There is no component ${line.component}` });
    else if (c.calculation !== 'structure') {
      problems.push({ code: line.component, message: `${c.name} is not worked out by structures` });
    }
  }
  for (const code of Object.keys(fixed)) {
    const c = byCode.get(code);
    if (!c || c.calculation !== 'fixed' || !c.isActive) {
      problems.push({ code, message: `${code} is not a fixed amount component` });
    }
  }
  if (problems.length) return { lines: [], gross: '0.00', problems };

  const input = inputName(structure.basis);
  const result = evaluateLines(
    structure.lines.map((l) => ({ code: l.component, formula: l.formula })),
    { [input]: amount },
  );
  if (result.problems.length) return { lines: [], gross: '0.00', problems: result.problems };

  const amounts = new Map<string, Decimal>(
    Object.entries(result.values).map(([code, v]) => [code, new Decimal(v)]),
  );
  // With a basic-based structure, the basic is the amount entered.
  if (structure.basis === 'basic') amounts.set('BASIC', new Decimal(amount));
  for (const [code, v] of Object.entries(fixed)) amounts.set(code, new Decimal(v));

  for (const [code, value] of amounts) {
    if (value.isNegative() && !options.allowNegative) {
      problems.push({ code, message: `${code} comes out below zero (${money(value)})` });
    }
  }
  if (problems.length) return { lines: [], gross: '0.00', problems };

  const sortOf = (code: string) => byCode.get(code)?.sortOrder ?? 999;
  const lines = [...amounts]
    .toSorted(([a], [b]) => sortOf(a) - sortOf(b) || a.localeCompare(b))
    .map(([code, value]) => {
      const c = byCode.get(code);
      return {
        code,
        name: c?.name ?? code,
        nameBn: c?.nameBn ?? null,
        kind: c?.kind ?? 'earning',
        inGross: c?.inGross ?? false,
        amount: money(value),
      };
    });
  const gross = lines
    .filter((l) => l.inGross)
    .reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
  return { lines, gross: money(gross), problems: [] };
}

/**
 * For a gross-based structure, the lines counted in gross must add up to the gross entered,
 * or "gross" would mean two things. Checked at a few amounts when a structure is saved.
 */
export function balanceProblem(
  structure: StructureInfo,
  components: readonly ComponentInfo[],
  sample: string,
): string | null {
  if (structure.basis !== 'gross') return null;
  const { lines, problems } = workOutPay(
    structure,
    components,
    sample,
    {},
    { allowNegative: true },
  );
  if (problems.length) return null;
  const total = lines.filter((l) => l.inGross).reduce((s, l) => s.plus(l.amount), new Decimal(0));
  return total.equals(sample)
    ? null
    : `For a gross of ${money(sample)} the lines counted in gross add up to ${money(total)}`;
}

/** How pay compares with its grade's minimum wage, when the structure has a wage table. */
export function minimumWageCheck(
  structure: StructureInfo,
  grade: string | null,
  on: string,
  result: PayResult,
): MinimumWageCheck | null {
  if (!structure.wageBoard || !grade) return null;
  const board = bdWageBoard(structure.wageBoard);
  const row = board?.grades.find((g) => g.grade === grade);
  if (!board || !row || board.effectiveFrom > on) return null;
  const basic = result.lines.find((l) => l.code === 'BASIC')?.amount ?? '0';
  return {
    board: board.id,
    grade,
    minimumGross: money(row.gross),
    minimumBasic: money(row.basic),
    meets:
      new Decimal(result.gross).greaterThanOrEqualTo(row.gross) &&
      new Decimal(basic).greaterThanOrEqualTo(row.basic),
  };
}
