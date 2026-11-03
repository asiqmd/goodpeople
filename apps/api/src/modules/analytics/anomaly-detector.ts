import { Injectable } from '@nestjs/common';
import { attendanceSettings, type Tx } from '@gp/db';
import {
  addDays,
  addMonths,
  ANOMALY_ABSOLUTE_THRESHOLDS,
  ANOMALY_BASELINE_MONTHS,
  ANOMALY_RELATIVE_THRESHOLD,
  ANOMALY_VERSION,
  Decimal,
  INSIGHT_VERSION,
  todayIn,
  WORKFORCE_VERSION,
  type AnomalyDefinition,
  type AnomalyEvaluation,
  type AnomalyOutcome,
  type InsightPoint,
} from '@gp/shared';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { AnalyticsService } from './analytics.service.js';
import { insightHash, InsightsService } from './insights.service.js';
import { operatingInsight } from './operating-insights.js';

export const previousMonth = (month: string, offset: number) =>
  addMonths(month + '-01', -offset).slice(0, 7);
export const monthEnd = (month: string) => addDays(addMonths(month + '-01', 1), -1);
export const latestReviewMonth = (now = new Date()) =>
  previousMonth(todayIn('Asia/Dhaka', now).slice(0, 7), 1);

type MovementRule = keyof typeof ANOMALY_ABSOLUTE_THRESHOLDS;

export function movementOutcome(
  rule: MovementRule,
  month: string,
  points: readonly InsightPoint[],
): AnomalyOutcome {
  const attendance = rule === 'attendance_movement';
  const currency = attendance ? null : 'BDT';
  const metric = attendance ? 'worked_minutes' : 'employer_cost';
  const observations: Decimal[] = [];
  for (let offset = ANOMALY_BASELINE_MONTHS; offset >= 0; offset--) {
    const period = previousMonth(month, offset);
    const point = points.find((p) => p.month === period);
    if (!point || point.state !== 'recorded') return { state: 'insufficient', reason: 'baseline' };
    if (point.country !== 'BD' || point.currency !== currency)
      return { state: 'insufficient', reason: 'context' };
    const raw = point.values[metric];
    if (raw === undefined || !/^\d+(\.\d+)?$/.test(raw))
      return { state: 'insufficient', reason: 'baseline' };
    const value = new Decimal(raw);
    observations.push(attendance ? value.div(Number(monthEnd(period).slice(8))) : value);
  }
  const observed = observations.pop()!;
  const baseline = observations
    .reduce((sum, value) => sum.plus(value), new Decimal(0))
    .div(ANOMALY_BASELINE_MONTHS);
  if (baseline.isZero()) return { state: 'insufficient', reason: 'zero_baseline' };
  const difference = observed.minus(baseline);
  const changePercent = difference.div(baseline).times(100);
  const absoluteThreshold = ANOMALY_ABSOLUTE_THRESHOLDS[rule];
  const state =
    difference.abs().gte(absoluteThreshold) && changePercent.abs().gte(ANOMALY_RELATIVE_THRESHOLD)
      ? 'detected'
      : 'clear';
  return {
    state,
    evidence: {
      kind: 'movement',
      unit: attendance ? 'minutes_per_day' : 'BDT',
      observed: observed.toFixed(2),
      baseline: baseline.toFixed(2),
      baselineFrom: previousMonth(month, ANOMALY_BASELINE_MONTHS),
      baselineThrough: previousMonth(month, 1),
      difference: difference.toFixed(2),
      changePercent: changePercent.toFixed(2),
      absoluteThreshold,
      relativeThreshold: ANOMALY_RELATIVE_THRESHOLD,
    },
  };
}

@Injectable()
export class AnomalyDetector {
  constructor(
    private readonly workforce: AnalyticsService,
    private readonly insights: InsightsService,
  ) {}

  async evaluate(
    tx: Tx,
    user: AuthUser,
    definition: AnomalyDefinition,
  ): Promise<AnomalyEvaluation> {
    const { rule, month } = definition;
    if (month > latestReviewMonth()) throw badRequest('anomaly_month', 'Choose a completed month');
    const sourceVersion = rule === 'assignment_coverage' ? WORKFORCE_VERSION : INSIGHT_VERSION;
    const finish = (outcome: AnomalyOutcome, revision: unknown): AnomalyEvaluation => ({
      ...outcome,
      version: ANOMALY_VERSION,
      sourceVersion,
      sourceRevision: insightHash([ANOMALY_VERSION, definition, sourceVersion, revision, outcome]),
      measuredAt: new Date().toISOString(),
    });
    if (rule === 'assignment_coverage') {
      const asOf = monthEnd(month);
      const report = await this.workforce.workforce(user, { asOf }, tx);
      const headcount = report.metrics.find((m) => m.id === 'headcount')!;
      const issues = headcount.issues.filter(
        (issue) => issue === 'missing_assignment' || issue === 'overlapping_assignments',
      );
      const supported = report.companies.every(
        (c) => c.countryCode === 'BD' && c.businessToday && c.businessToday > asOf,
      );
      return finish(
        !supported || headcount.state === 'unavailable'
          ? { state: 'insufficient', reason: 'context' }
          : issues.length
            ? { state: 'detected', evidence: { kind: 'assignments', issues } }
            : headcount.state === 'current'
              ? { state: 'clear' }
              : { state: 'insufficient', reason: 'coverage' },
        report.sourceRevision,
      );
    }
    if (rule === 'payroll_movement') {
      const report = await this.insights.measureAuthorized(tx, { kind: 'payroll', month }, true);
      const relevant = report.points.filter(
        (point) => point.month >= previousMonth(month, ANOMALY_BASELINE_MONTHS),
      );
      return finish(movementOutcome(rule, month, relevant), relevant);
    }

    const attendance = { kind: 'attendance' as const, month, companyId: definition.companyId };
    const window = await this.insights.window(tx, attendance);
    const context = window.context;
    if (!context || context.country !== 'BD')
      return finish({ state: 'insufficient', reason: 'context' }, context);
    if (rule === 'attendance_processing') {
      const [settings] = await tx
        .select({
          trackingFrom: attendanceSettings.trackingFrom,
          processedThrough: attendanceSettings.processedThrough,
        })
        .from(attendanceSettings);
      if (!settings || settings.trackingFrom > window.from)
        return finish({ state: 'insufficient', reason: 'coverage' }, settings);
      if (!settings.processedThrough || settings.processedThrough < window.through)
        return finish(
          {
            state: 'detected',
            evidence: { kind: 'processing', ...settings, expected: window.through },
          },
          context,
        );
      const point = await operatingInsight(tx, attendance, { ...window, ...context });
      return finish(
        point.state === 'provisional'
          ? { state: 'detected', evidence: { kind: 'pending_attendance' } }
          : point.state === 'recorded'
            ? { state: 'clear' }
            : { state: 'insufficient', reason: 'coverage' },
        [context, point.state, point.issue],
      );
    }
    const points: InsightPoint[] = [];
    for (let offset = ANOMALY_BASELINE_MONTHS; offset >= 0; offset--) {
      const period = { ...attendance, month: previousMonth(month, offset) };
      const prior = offset ? await this.insights.window(tx, period) : window;
      if (prior.context?.country !== 'BD' || prior.context.timeZone !== context.timeZone)
        return finish({ state: 'insufficient', reason: 'context' }, [context, prior.context]);
      points.push(await operatingInsight(tx, period, { ...prior, ...prior.context }));
    }
    return finish(movementOutcome(rule, month, points), [context, points]);
  }
}
