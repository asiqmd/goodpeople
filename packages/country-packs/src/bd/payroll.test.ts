import { evaluateLines } from '@gp/shared';
import { describe, expect, it } from 'vitest';
import { BD_PAY_COMPONENTS, BD_SALARY_STRUCTURES, BD_WAGE_BOARDS, bdWageBoard } from './payroll.js';

const structure = (code: string) => BD_SALARY_STRUCTURES.find((s) => s.code === code)!;
const lines = (code: string) =>
  structure(code).lines.map((l) => ({ code: l.component, formula: l.formula }));

describe('the RMG structure', () => {
  const board = bdWageBoard('BD_RMG_2023')!;

  it.each(board.grades.map((g) => [g.grade, g] as const))(
    'splits the %s minimum exactly as the gazette does',
    (_, grade) => {
      const { values, problems } = evaluateLines(lines('RMG_WORKER'), { GROSS: grade.gross });
      expect(problems).toEqual([]);
      expect(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]))).toEqual(
        grade.components,
      );
    },
  );

  it('adds up to the gross for any amount', () => {
    for (const gross of [12_500, 13_001, 15_999, 20_333]) {
      const { values } = evaluateLines(lines('RMG_WORKER'), { GROSS: gross });
      expect(Object.values(values).reduce((sum, v) => sum + Number(v), 0)).toBe(gross);
    }
  });

  it('keeps each gazette grade’s parts adding up to its gross', () => {
    for (const table of BD_WAGE_BOARDS) {
      for (const g of table.grades) {
        expect(Object.values(g.components).reduce((a, b) => a + b, 0)).toBe(g.gross);
        expect(g.components.BASIC).toBe(g.basic);
      }
    }
  });
});

describe('the staff structure', () => {
  it('adds up to the gross', () => {
    for (const gross of [30_000, 45_555, 120_001]) {
      const { values, problems } = evaluateLines(lines('STAFF'), { GROSS: gross });
      expect(problems).toEqual([]);
      expect(Object.values(values).reduce((sum, v) => sum + Number(v), 0)).toBe(gross);
    }
  });
});

describe('components', () => {
  it('use only codes the structures know, and only basic is in the overtime base', () => {
    const codes = new Set(BD_PAY_COMPONENTS.map((c) => c.code));
    for (const s of BD_SALARY_STRUCTURES)
      for (const l of s.lines) expect(codes).toContain(l.component);
    expect(BD_PAY_COMPONENTS.filter((c) => c.inOvertimeBase).map((c) => c.code)).toEqual(['BASIC']);
  });
});
