import { describe, expect, it } from 'vitest';
import { goalProblem, goalProgress, goalWeights, weightsComplete } from './goals.js';

const objective = (done: boolean[], progress = 0) => ({
  kind: 'objective' as const,
  keyResults: done.map((d) => ({ done: d })),
  target: null,
  direction: null,
  currentValue: null,
  progress,
});
const kpi = (
  direction: 'higher' | 'lower' | null,
  target: string | number | null,
  currentValue: string | number | null,
  progress = 0,
) => ({ kind: 'kpi' as const, keyResults: [], target, direction, currentValue, progress });

describe('a goal’s progress', () => {
  it('is the share of an objective’s key results done', () => {
    expect(goalProgress(objective([true, false, false, true]))).toBe(50);
    expect(goalProgress(objective([true, false, false]))).toBe(33);
    expect(goalProgress(objective([true, true]))).toBe(100);
    expect(goalProgress(objective([false], 80))).toBe(0);
  });

  it('is as last set for an objective without key results', () => {
    expect(goalProgress(objective([], 40))).toBe(40);
    expect(goalProgress(objective([], 140))).toBe(100);
  });

  it('is a KPI’s value against its target when higher is better, capped at 100', () => {
    expect(goalProgress(kpi('higher', '95.00', '76.00'))).toBe(80);
    expect(goalProgress(kpi('higher', 95, 99.5))).toBe(100);
    expect(goalProgress(kpi('higher', 95, 0))).toBe(0);
    expect(goalProgress(kpi('higher', 0, 0))).toBe(100);
  });

  it('is 100 at or below the target when lower is better, else the target’s share', () => {
    expect(goalProgress(kpi('lower', '2.00', '1.50'))).toBe(100);
    expect(goalProgress(kpi('lower', 2, 2))).toBe(100);
    expect(goalProgress(kpi('lower', 2, 4))).toBe(50);
    expect(goalProgress(kpi('lower', 0, 3))).toBe(0);
    expect(goalProgress(kpi('lower', 5, 0))).toBe(100);
  });

  it('stays as last set while a KPI has no value or target yet', () => {
    expect(goalProgress(kpi('higher', 95, null, 30))).toBe(30);
    expect(goalProgress(kpi('higher', null, 50, 30))).toBe(30);
    expect(goalProgress(kpi(null, 95, 50, 30))).toBe(30);
  });
});

describe('a person’s goal weights for a cycle', () => {
  it('counts agreed and completed goals as agreed, drafts apart, dropped ones not at all', () => {
    const weights = goalWeights([
      { status: 'agreed', weight: '40.00' },
      { status: 'completed', weight: '20.00' },
      { status: 'draft', weight: '33.33' },
      { status: 'draft', weight: null },
      { status: 'dropped', weight: '50.00' },
    ]);
    expect(weights).toEqual({ agreed: 60, draft: 33.33, total: 93.33 });
  });

  it('adds up to 100 only exactly, to two decimals', () => {
    const thirds = goalWeights(
      ['33.33', '33.33', '33.34'].map((weight) => ({ status: 'draft' as const, weight })),
    );
    expect(weightsComplete(thirds.total)).toBe(true);
    expect(weightsComplete(99.99)).toBe(false);
    expect(weightsComplete(100.01)).toBe(false);
  });
});

describe('a goal’s fields together', () => {
  it('asks a KPI for a target, a unit and a direction, unless it reads the records', () => {
    expect(goalProblem({ kind: 'kpi', measureUnit: '%', direction: 'higher' })?.path).toBe(
      'target',
    );
    expect(goalProblem({ kind: 'kpi', target: 95, direction: 'higher' })?.code).toBe(
      'goal_unit_required',
    );
    expect(goalProblem({ kind: 'kpi', target: 95, measureUnit: '%' })?.code).toBe(
      'goal_direction_required',
    );
    expect(goalProblem({ kind: 'kpi', target: 95, source: 'attendance_rate' })?.code).toBe(
      'goal_start_required',
    );
    expect(
      goalProblem({
        kind: 'kpi',
        target: 95,
        source: 'attendance_rate',
        startsOn: '2026-01-01',
      }),
    ).toBeNull();
  });

  it('is a person’s or a unit’s, and is due on or after it starts', () => {
    expect(goalProblem({ kind: 'objective', employeeId: 'a', orgUnitId: 'b' })?.code).toBe(
      'goal_owner_one',
    );
    expect(
      goalProblem({ kind: 'objective', startsOn: '2026-02-01', dueOn: '2026-01-31' })?.path,
    ).toBe('dueOn');
    expect(
      goalProblem({ kind: 'objective', startsOn: '2026-02-01', dueOn: '2026-02-01' }),
    ).toBeNull();
  });
});
