import { type InsightPoint } from '@gp/shared';
import { movementOutcome, previousMonth, monthEnd } from './anomaly-detector.js';

const month = '2026-10';
const points = (values: string[], currency: string | null = 'BDT'): InsightPoint[] =>
  values.map((value, i) => ({
    month: previousMonth(month, 3 - i),
    state: 'recorded',
    country: 'BD',
    currency,
    values: currency === null ? { worked_minutes: value } : { employer_cost: value },
  }));

describe('anomaly.v1 movement rules', () => {
  it.each([
    ['50000.00', 'detected', '10000.00', '25.00'],
    ['49999.99', 'clear', '9999.99', '25.00'],
    ['30000.00', 'detected', '-10000.00', '-25.00'],
    ['40000.00', 'clear', '0.00', '0.00'],
  ])(
    'uses exact decimal comparison for employer cost of %s',
    (value, state, difference, changePercent) => {
      expect(
        movementOutcome('payroll_movement', month, points(['40000', '40000', '40000', value])),
      ).toMatchObject({ state, evidence: { baseline: '40000.00', difference, changePercent } });
    },
  );

  it('requires the relative threshold even for a large absolute change', () => {
    expect(
      movementOutcome('payroll_movement', month, points(['100000', '100000', '100000', '111000'])),
    ).toMatchObject({
      state: 'clear',
      evidence: { difference: '11000.00', changePercent: '11.00' },
    });
  });

  it('normalizes attendance across unequal month lengths', () => {
    const days = points(['0', '0', '0', '0'], null).map((p) => Number(monthEnd(p.month).slice(8)));
    const observations = days.map((day, i) => String(day * (i === 3 ? 3800 : 2000)));
    expect(movementOutcome('attendance_movement', month, points(observations, null))).toMatchObject(
      {
        state: 'detected',
        evidence: {
          baseline: '2000.00',
          observed: '3800.00',
          difference: '1800.00',
          unit: 'minutes_per_day',
        },
      },
    );
  });

  it('excludes low cohorts, provisional results, missing months, zero baselines and other currencies', () => {
    const data = points(['20000', '20000', '20000', '33000']);
    for (const state of ['suppressed', 'provisional', 'incomplete', 'unavailable'] as const) {
      expect(
        movementOutcome('payroll_movement', month, [{ ...data[0]!, state }, ...data.slice(1)]),
      ).toEqual({ state: 'insufficient', reason: 'baseline' });
    }
    expect(movementOutcome('payroll_movement', month, data.slice(1))).toEqual({
      state: 'insufficient',
      reason: 'baseline',
    });
    expect(movementOutcome('payroll_movement', month, points(['0', '0', '0', '10000']))).toEqual({
      state: 'insufficient',
      reason: 'zero_baseline',
    });
    expect(
      movementOutcome('payroll_movement', month, [
        { ...data[0]!, currency: 'SAR' },
        ...data.slice(1),
      ]),
    ).toEqual({ state: 'insufficient', reason: 'context' });
  });
});
