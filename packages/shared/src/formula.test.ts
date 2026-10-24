import { describe, expect, it } from 'vitest';
import {
  Decimal,
  evaluateFormula,
  evaluateLines,
  FormulaError,
  namesIn,
  parseFormula,
} from './formula.js';

const run = (text: string, values: Record<string, string | number> = {}) =>
  evaluateFormula(parseFormula(text), values).toFixed();

/** The message and position of the error a formula fails to parse with. */
function error(text: string) {
  try {
    parseFormula(text);
  } catch (e) {
    return { message: (e as FormulaError).message, at: (e as FormulaError).position };
  }
  throw new Error(`${text} parsed`);
}

describe('formulas', () => {
  it('follows the usual precedence', () => {
    expect(run('2 + 3 * 4')).toBe('14');
    expect(run('(2 + 3) * 4')).toBe('20');
    expect(run('-2 * -3')).toBe('6');
    expect(run('10 - 4 - 3')).toBe('3');
    expect(run('2 * 3 > 5 && 1 < 2')).toBe('1');
  });

  it('works in exact decimals', () => {
    expect(run('0.1 + 0.2')).toBe('0.3');
    // Division keeps 40 significant digits; money is rounded where the formula says.
    expect(run('round(10 / 3 * 3, 2)')).toBe('10');
    expect(run('round(13000 * 0.6 / 1.1, 2)')).toBe('7090.91');
  });

  it('rounds money half up', () => {
    expect(run('round(2.5)')).toBe('3');
    expect(run('round(-2.5)')).toBe('-3');
    expect(run('floor(7033.9)')).toBe('7033');
    expect(run('ceil(7033.1)')).toBe('7034');
    expect(run('round(1.005, 2)')).toBe('1.01');
  });

  it('uses names, case-blind, and functions', () => {
    expect(run('round((gross - 2450) / 1.5)', { GROSS: 12500 })).toBe('6700');
    expect(run('min(BASIC, 5000) + max(1, 2, 3)', { BASIC: 6700 })).toBe('5003');
    expect(run('if(YEARS >= 1, BASIC, 0)', { YEARS: 0, BASIC: 6700 })).toBe('0');
    expect(run('abs(-4)')).toBe('4');
  });

  it('works out only the branch an if takes', () => {
    expect(run('if(DAYS == 0, 0, PAY / DAYS)', { DAYS: 0, PAY: 100 })).toBe('0');
  });

  it('lists the names a formula uses', () => {
    expect([...namesIn(parseFormula('BASIC * 0.5 + if(x > 1, Medical, 0)'))].toSorted()).toEqual([
      'BASIC',
      'MEDICAL',
      'X',
    ]);
  });

  it('says what is wrong and where', () => {
    expect(error('')).toEqual({ message: 'The formula is empty', at: 0 });
    expect(error('BASIC *')).toMatchObject({ message: 'The formula ends too early' });
    expect(error('(BASIC + 1')).toMatchObject({ message: 'Expected ")" at the end' });
    expect(error('BASIC $ 2')).toEqual({ message: 'Unexpected "$"', at: 6 });
    expect(error('pow(2, 3)')).toMatchObject({ message: 'Unknown function "pow"' });
    expect(error('if(1, 2)').message).toContain('if(condition, then, otherwise)');
    expect(error('1 2').message).toBe('Unexpected text after the formula');
    expect(error('x'.repeat(501)).message).toContain('at most 500');
    expect(error('('.repeat(60) + '1' + ')'.repeat(60)).message).toContain('nested too deeply');
  });

  it('refuses unknown names and division by zero when working out', () => {
    expect(() => run('UNKNOWN + 1')).toThrow('Unknown name "UNKNOWN"');
    expect(() => run('1 / 0')).toThrow('Division by zero');
    expect(() => run('round(1, 0.5)')).toThrow('whole number');
  });

  it('cannot reach JavaScript', () => {
    expect(() => run('constructor')).toThrow('Unknown name "CONSTRUCTOR"');
    expect(() => run('__proto__ + 1')).toThrow(FormulaError);
    expect(() => parseFormula('process.exit(1)')).toThrow(FormulaError);
    expect(() => parseFormula('this["x"]')).toThrow(FormulaError);
  });

  it('keeps its own decimal settings', () => {
    expect(new Decimal('2.5').toDecimalPlaces(0).toFixed()).toBe('3');
  });
});

describe('sets of lines', () => {
  const rmg = [
    { code: 'MEDICAL', formula: '750' },
    { code: 'CONVEYANCE', formula: '450' },
    { code: 'FOOD', formula: '1250' },
    { code: 'HOUSE_RENT', formula: 'GROSS - BASIC - MEDICAL - CONVEYANCE - FOOD' },
    { code: 'BASIC', formula: 'round((GROSS - MEDICAL - CONVEYANCE - FOOD) / 1.5)' },
  ];

  it('works lines out in the order they need, whatever order they are written in', () => {
    expect(evaluateLines(rmg, { GROSS: 12500 })).toEqual({
      values: {
        MEDICAL: '750',
        CONVEYANCE: '450',
        FOOD: '1250',
        BASIC: '6700',
        HOUSE_RENT: '3350',
      },
      problems: [],
    });
    // An amount that does not divide evenly still adds up to the gross.
    const odd = evaluateLines(rmg, { GROSS: 13001 }).values;
    const total = Object.values(odd).reduce((sum, v) => sum.plus(v), new Decimal(0));
    expect(total.toFixed()).toBe('13001');
  });

  it('reports every problem at once', () => {
    const result = evaluateLines(
      [
        { code: 'A', formula: 'B + 1' },
        { code: 'B', formula: 'A * 2' },
        { code: 'C', formula: 'MISSING' },
        { code: 'D', formula: '(' },
        { code: 'C', formula: '1' },
        { code: 'GROSS', formula: '1' },
      ],
      { GROSS: 100 },
    );
    expect(result.values).toEqual({});
    expect(result.problems).toEqual(
      expect.arrayContaining([
        { code: 'C', message: 'C appears twice' },
        { code: 'GROSS', message: 'GROSS is given as an input and cannot also be a line' },
        { code: 'D', message: 'The formula ends too early', position: 1 },
        { code: 'C', message: 'Unknown name "MISSING"' },
        { code: null, message: 'These lines depend on each other: A → B → A' },
      ]),
    );
  });

  it('reports a line that fails when worked out', () => {
    expect(evaluateLines([{ code: 'X', formula: 'GROSS / 0' }], { GROSS: 1 }).problems).toEqual([
      { code: 'X', message: 'Division by zero' },
    ]);
  });
});
