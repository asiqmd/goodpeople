import { Decimal as DecimalBase } from 'decimal.js';

/**
 * Pay formulas such as `round((GROSS - 2450) / 1.5)`: decimal arithmetic over named amounts.
 *
 * The text is parsed into a tree and evaluated here, never handed to `eval` or `Function`: a
 * formula can only combine numbers and the names it is given, with a few functions. Amounts
 * are exact decimals (decimal.js), so 0.1 + 0.2 is 0.3 and a taka is never lost to binary
 * floating point.
 */

/** Exact decimals; money rounds half up, as payroll does. */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

export const FORMULA_FUNCTIONS = ['min', 'max', 'round', 'floor', 'ceil', 'abs', 'if'] as const;
export type FormulaFunction = (typeof FORMULA_FUNCTIONS)[number];

type BinaryOp = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';

export type FormulaNode =
  | { type: 'number'; value: string }
  | { type: 'name'; name: string }
  | { type: 'unary'; op: '-' | '!'; operand: FormulaNode }
  | { type: 'binary'; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { type: 'call'; fn: FormulaFunction; args: FormulaNode[] };

/** A formula that cannot be read or worked out, with where (a character index) when known. */
export class FormulaError extends Error {
  constructor(
    message: string,
    readonly position?: number,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

/** Long enough for any real pay rule, short enough that nobody can make the server work hard. */
export const MAX_FORMULA_LENGTH = 500;
const MAX_DEPTH = 40;

// ── Reading ──────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'number'; value: string; at: number }
  | { kind: 'name'; value: string; at: number }
  | { kind: 'op'; value: string; at: number }
  | { kind: 'end'; at: number };

const OPERATORS = [
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '<',
  '>',
  '!',
  '(',
  ')',
  ',',
];

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const number = /^(\d+(\.\d+)?|\.\d+)/.exec(text.slice(i));
    if (number) {
      tokens.push({ kind: 'number', value: number[0], at: i });
      i += number[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (name) {
      tokens.push({ kind: 'name', value: name[0], at: i });
      i += name[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (!op) throw new FormulaError(`Unexpected "${c}"`, i);
    tokens.push({ kind: 'op', value: op, at: i });
    i += op.length;
  }
  tokens.push({ kind: 'end', at: text.length });
  return tokens;
}

/** Reads a formula into a tree, or throws a FormulaError saying what is wrong and where. */
export function parseFormula(text: string): FormulaNode {
  if (text.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(`A formula can be at most ${MAX_FORMULA_LENGTH} characters`);
  }
  const tokens = tokenize(text);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos]!;
  const isOp = (value: string) => {
    const t = peek();
    return t.kind === 'op' && t.value === value;
  };
  const expect = (value: string) => {
    if (!isOp(value)) {
      const t = peek();
      throw new FormulaError(
        t.kind === 'end' ? `Expected "${value}" at the end` : `Expected "${value}"`,
        t.at,
      );
    }
    pos++;
  };
  const nested = <T>(fn: () => T): T => {
    if (++depth > MAX_DEPTH) throw new FormulaError('The formula is nested too deeply', peek().at);
    try {
      return fn();
    } finally {
      depth--;
    }
  };

  const binaryLevel = (ops: string[], next: () => FormulaNode) => (): FormulaNode => {
    let left = next();
    for (;;) {
      const t = peek();
      if (t.kind !== 'op' || !ops.includes(t.value)) return left;
      pos++;
      left = { type: 'binary', op: t.value as BinaryOp, left, right: next() };
    }
  };

  const primary = (): FormulaNode =>
    nested(() => {
      const t = peek();
      if (t.kind === 'number') {
        pos++;
        return { type: 'number', value: t.value };
      }
      if (t.kind === 'name') {
        pos++;
        if (!isOp('(')) return { type: 'name', name: t.value.toUpperCase() };
        const fn = t.value.toLowerCase() as FormulaFunction;
        if (!FORMULA_FUNCTIONS.includes(fn)) {
          throw new FormulaError(`Unknown function "${t.value}"`, t.at);
        }
        pos++;
        const args: FormulaNode[] = [];
        if (!isOp(')')) {
          do args.push(expression());
          while (isOp(',') && ++pos);
        }
        expect(')');
        checkArity(fn, args.length, t.at);
        return { type: 'call', fn, args };
      }
      if (isOp('(')) {
        pos++;
        const inner = expression();
        expect(')');
        return inner;
      }
      if (isOp('-') || isOp('!')) {
        pos++;
        return {
          type: 'unary',
          op: t.kind === 'op' ? (t.value as '-' | '!') : '-',
          operand: primary(),
        };
      }
      throw new FormulaError(
        t.kind === 'end' ? 'The formula ends too early' : 'Expected a number or a name',
        t.at,
      );
    });

  const multiplicative = binaryLevel(['*', '/'], primary);
  const additive = binaryLevel(['+', '-'], multiplicative);
  const comparison = binaryLevel(['<', '<=', '>', '>=', '==', '!='], additive);
  const and = binaryLevel(['&&'], comparison);
  const expression = binaryLevel(['||'], and);

  if (tokens.length === 1) throw new FormulaError('The formula is empty', 0);
  const tree = expression();
  const rest = peek();
  if (rest.kind !== 'end') throw new FormulaError('Unexpected text after the formula', rest.at);
  return tree;
}

function checkArity(fn: FormulaFunction, count: number, at: number) {
  const ok =
    fn === 'if'
      ? count === 3
      : fn === 'min' || fn === 'max'
        ? count >= 1
        : fn === 'round' || fn === 'floor' || fn === 'ceil'
          ? count === 1 || count === 2
          : count === 1;
  if (!ok) {
    const wanted =
      fn === 'if'
        ? 'if(condition, then, otherwise)'
        : fn === 'min' || fn === 'max'
          ? `${fn}(a, b, …)`
          : fn === 'abs'
            ? 'abs(x)'
            : `${fn}(x) or ${fn}(x, decimals)`;
    throw new FormulaError(`Use ${wanted}`, at);
  }
}

/** Every name a formula uses (upper case). */
export function namesIn(node: FormulaNode, into = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'name':
      into.add(node.name);
      break;
    case 'unary':
      namesIn(node.operand, into);
      break;
    case 'binary':
      namesIn(node.left, into);
      namesIn(node.right, into);
      break;
    case 'call':
      for (const arg of node.args) namesIn(arg, into);
      break;
  }
  return into;
}

// ── Working out ──────────────────────────────────────────────────────────────

const ONE = new Decimal(1);
const ZERO = new Decimal(0);
const truth = (value: boolean) => (value ? ONE : ZERO);

function places(node: FormulaNode | undefined, values: ReadonlyMap<string, Decimal>): number {
  if (!node) return 0;
  const n = evaluate(node, values);
  if (!n.isInteger() || n.isNegative() || n.greaterThan(10)) {
    throw new FormulaError('Decimal places must be a whole number from 0 to 10');
  }
  return n.toNumber();
}

function evaluate(node: FormulaNode, values: ReadonlyMap<string, Decimal>): Decimal {
  switch (node.type) {
    case 'number':
      return new Decimal(node.value);
    case 'name': {
      const value = values.get(node.name);
      if (value === undefined) throw new FormulaError(`Unknown name "${node.name}"`);
      return value;
    }
    case 'unary': {
      const operand = evaluate(node.operand, values);
      return node.op === '-' ? operand.negated() : truth(operand.isZero());
    }
    case 'binary': {
      if (node.op === '&&') {
        return truth(
          !evaluate(node.left, values).isZero() && !evaluate(node.right, values).isZero(),
        );
      }
      if (node.op === '||') {
        return truth(
          !evaluate(node.left, values).isZero() || !evaluate(node.right, values).isZero(),
        );
      }
      const a = evaluate(node.left, values);
      const b = evaluate(node.right, values);
      switch (node.op) {
        case '+':
          return a.plus(b);
        case '-':
          return a.minus(b);
        case '*':
          return a.times(b);
        case '/':
          if (b.isZero()) throw new FormulaError('Division by zero');
          return a.dividedBy(b);
        case '<':
          return truth(a.lessThan(b));
        case '<=':
          return truth(a.lessThanOrEqualTo(b));
        case '>':
          return truth(a.greaterThan(b));
        case '>=':
          return truth(a.greaterThanOrEqualTo(b));
        case '==':
          return truth(a.equals(b));
        case '!=':
          return truth(!a.equals(b));
      }
      break;
    }
    case 'call': {
      const [first, second, third] = node.args;
      switch (node.fn) {
        case 'if':
          // Only the chosen branch is worked out, so the other may divide by zero.
          return evaluate(evaluate(first!, values).isZero() ? third! : second!, values);
        case 'min':
          return Decimal.min(...node.args.map((a) => evaluate(a, values)));
        case 'max':
          return Decimal.max(...node.args.map((a) => evaluate(a, values)));
        case 'abs':
          return evaluate(first!, values).abs();
        case 'round':
          return evaluate(first!, values).toDecimalPlaces(
            places(second, values),
            Decimal.ROUND_HALF_UP,
          );
        case 'floor':
          return evaluate(first!, values).toDecimalPlaces(
            places(second, values),
            Decimal.ROUND_FLOOR,
          );
        case 'ceil':
          return evaluate(first!, values).toDecimalPlaces(
            places(second, values),
            Decimal.ROUND_CEIL,
          );
      }
    }
  }
  throw new FormulaError('Cannot work this out');
}

/** Works a parsed formula out with the given amounts (names in upper case). */
export function evaluateFormula(
  node: FormulaNode,
  values: ReadonlyMap<string, Decimal> | Readonly<Record<string, DecimalBase.Value>>,
): Decimal {
  const map =
    values instanceof Map
      ? (values as ReadonlyMap<string, Decimal>)
      : new Map(Object.entries(values).map(([k, v]) => [k.toUpperCase(), new Decimal(v)]));
  return evaluate(node, map);
}

// ── Sets of lines (a salary structure) ───────────────────────────────────────

/** One component's formula in a structure, e.g. `{ code: 'BASIC', formula: 'GROSS * 0.6' }`. */
export interface FormulaLine {
  code: string;
  formula: string;
}

export interface LineProblem {
  /** The line's code, or null for a problem with the set as a whole. */
  code: string | null;
  message: string;
  position?: number;
}

export interface LinesResult {
  /** Every line's amount, as a decimal string, when all of them could be worked out. */
  values: Record<string, string>;
  problems: LineProblem[];
}

/**
 * Works out a set of lines in the order their names require, from the inputs given (for
 * example `GROSS`). Reports every unreadable line, unknown name and cycle rather than the
 * first one only, so an editor can show them all.
 */
export function evaluateLines(
  lines: readonly FormulaLine[],
  inputs: Readonly<Record<string, DecimalBase.Value>>,
): LinesResult {
  const problems: LineProblem[] = [];
  const parsed = new Map<string, FormulaNode>();
  const inputNames = new Set(Object.keys(inputs).map((k) => k.toUpperCase()));
  for (const line of lines) {
    const code = line.code.toUpperCase();
    if (parsed.has(code)) {
      problems.push({ code, message: `${code} appears twice` });
      continue;
    }
    if (inputNames.has(code)) {
      problems.push({ code, message: `${code} is given as an input and cannot also be a line` });
      continue;
    }
    try {
      parsed.set(code, parseFormula(line.formula));
    } catch (error) {
      const e = error as FormulaError;
      problems.push({ code, message: e.message, position: e.position });
    }
  }

  const needs = new Map([...parsed].map(([code, node]) => [code, namesIn(node)]));
  for (const [code, names] of needs) {
    for (const name of names) {
      if (!parsed.has(name) && !inputNames.has(name)) {
        problems.push({ code, message: `Unknown name "${name}"` });
      }
    }
  }

  // Depth-first ordering; a name met again while still open is a cycle.
  const order: string[] = [];
  const state = new Map<string, 'open' | 'done'>();
  const visit = (code: string, path: string[]): void => {
    if (state.get(code) === 'done') return;
    if (state.get(code) === 'open') {
      const cycle = [...path.slice(path.indexOf(code)), code];
      problems.push({
        code: null,
        message: `These lines depend on each other: ${cycle.join(' → ')}`,
      });
      return;
    }
    state.set(code, 'open');
    for (const name of needs.get(code) ?? []) if (parsed.has(name)) visit(name, [...path, code]);
    state.set(code, 'done');
    order.push(code);
  };
  for (const code of parsed.keys()) visit(code, []);
  if (problems.length) return { values: {}, problems };

  const values = new Map([...inputNames].map((name) => [name, ZERO]));
  for (const [k, v] of Object.entries(inputs)) values.set(k.toUpperCase(), new Decimal(v));
  const out: Record<string, string> = {};
  for (const code of order) {
    try {
      const value = evaluate(parsed.get(code)!, values);
      values.set(code, value);
      out[code] = value.toFixed();
    } catch (error) {
      problems.push({ code, message: (error as Error).message });
      return { values: {}, problems };
    }
  }
  return { values: out, problems };
}

/** A money amount as payroll shows it: two decimals, half up. */
export const money = (value: DecimalBase.Value) => new Decimal(value).toFixed(2);
