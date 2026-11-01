import {
  designations,
  employees,
  jobAssignments,
  legalEntities,
  orgUnits,
  performanceSettings,
  type Tx,
} from '@gp/db';
import {
  DEFAULT_COMPETENCIES,
  DEFAULT_RATING_GUIDE,
  todayIn,
  type CycleSummary,
  type EmployeeRef,
  type PerformanceSettingsView,
  type Rating,
  type Ref,
  type ReviewGoal,
  type ReviewRecommendationsView,
} from '@gp/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { agreedGoalsForReview } from '../goals/review-goals.js';
import { employeeRefSelect, type CycleRow, type ReviewRow } from './access.js';

// Reading what reviews show: the settings, a cycle's summary, people's names and jobs, and the
// goals a review rates.

export async function settingsOf(tx: Tx): Promise<PerformanceSettingsView> {
  const [row] = await tx.select().from(performanceSettings);
  return {
    competencies: row?.competencies ?? [...DEFAULT_COMPETENCIES],
    ratingGuide: (row?.ratingGuide as Record<Rating, number>) ?? { ...DEFAULT_RATING_GUIDE },
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export const cycleSummary = (c: CycleRow): CycleSummary => ({
  id: c.id,
  name: c.name,
  periodStart: c.periodStart,
  periodEnd: c.periodEnd,
  status: c.status,
  selfReview: c.selfReview,
  peerReview: c.peerReview,
  goalsDueOn: c.goalsDueOn,
  selfDueOn: c.selfDueOn,
  peerDueOn: c.peerDueOn,
  managerDueOn: c.managerDueOn,
  calibrationDueOn: c.calibrationDueOn,
});

export async function employeeRefs(
  tx: Tx,
  ids: (string | null)[],
): Promise<Map<string, EmployeeRef>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map();
  const rows = await tx
    .select(employeeRefSelect)
    .from(employees)
    .where(inArray(employees.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function entityRefs(tx: Tx, ids: string[]): Promise<Ref[]> {
  if (ids.length === 0) return [];
  return tx
    .select({ id: legalEntities.id, name: legalEntities.name })
    .from(legalEntities)
    .where(inArray(legalEntities.id, ids))
    .orderBy(asc(legalEntities.name));
}

export interface JobOf {
  legalEntity: Ref | null;
  orgUnit: Ref | null;
  designation: string | null;
  managerId: string | null;
}

/** Each person's job today, or their latest one (someone who has left keeps their last). */
export async function jobsOf(tx: Tx, employeeIds: string[]): Promise<Map<string, JobOf>> {
  if (employeeIds.length === 0) return new Map();
  const today = todayIn();
  const rows = await tx
    .select({
      employeeId: jobAssignments.employeeId,
      effectiveFrom: jobAssignments.effectiveFrom,
      effectiveTo: jobAssignments.effectiveTo,
      managerId: jobAssignments.managerId,
      legalEntity: { id: legalEntities.id, name: legalEntities.name },
      orgUnit: { id: orgUnits.id, name: orgUnits.name },
      designation: designations.name,
    })
    .from(jobAssignments)
    .innerJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
    .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
    .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
    .where(inArray(jobAssignments.employeeId, [...new Set(employeeIds)]))
    .orderBy(desc(jobAssignments.effectiveFrom));
  const inForce = (r: (typeof rows)[number]) =>
    r.effectiveFrom <= today && (r.effectiveTo === null || r.effectiveTo >= today);
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.employeeId, [...(byPerson.get(r.employeeId) ?? []), r]);
  const jobs = new Map<string, JobOf>();
  for (const [id, mine] of byPerson) {
    const r = mine.find(inForce) ?? mine[0]!;
    jobs.set(id, {
      legalEntity: r.legalEntity,
      orgUnit: r.orgUnit,
      designation: r.designation,
      managerId: r.managerId,
    });
  }
  return jobs;
}

export async function recommendationsView(
  tx: Tx,
  r: ReviewRow['recommendations'],
): Promise<ReviewRecommendationsView | null> {
  if (!r) return null;
  const [designation] = r.promotionDesignationId
    ? await tx
        .select({ id: designations.id, name: designations.name })
        .from(designations)
        .where(eq(designations.id, r.promotionDesignationId))
    : [];
  return { increment: r.increment, promotion: designation ?? null, plan: r.plan };
}

/**
 * The person's goals a review rates: those agreed (or completed) for its cycle, with KPIs from
 * the records as they stand today.
 */
export async function reviewGoals(
  tx: Tx,
  review: Pick<ReviewRow, 'cycleId' | 'employeeId'>,
): Promise<ReviewGoal[]> {
  const rows = await agreedGoalsForReview(tx, review.employeeId, review.cycleId);
  return rows.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    kind: g.kind,
    status: g.status,
    weight: g.weight,
    progress: g.progress,
    dueOn: g.dueOn,
    measureUnit: g.measureUnit,
    target: g.target,
    currentValue: g.currentValue,
    direction: g.direction,
    keyResults: g.keyResults,
  }));
}

export const iso = (d: Date | null) => d?.toISOString() ?? null;
export const asRating = (n: number | null) => n as Rating | null;
