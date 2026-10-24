import {
  costCentres,
  designations,
  employees,
  grades,
  jobAssignments,
  legalEntities,
  locations,
  orgUnits,
  type Tx,
} from '@gp/db';
import type { JobAssignmentView } from '@gp/shared';
import { and, desc, eq, gte, isNull, lte, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/** The job assignment in force on a date: started on or before it and not ended before it. */
export const inForceOn = (date: string) =>
  and(
    lte(jobAssignments.effectiveFrom, date),
    or(isNull(jobAssignments.effectiveTo), gte(jobAssignments.effectiveTo, date)),
  )!;

const manager = alias(employees, 'manager');

/** Job assignments with the names of everything they point at, newest first. */
export function selectAssignments(tx: Tx, where: SQL) {
  return tx
    .select({
      a: jobAssignments,
      legalEntity: { id: legalEntities.id, name: legalEntities.name },
      location: { id: locations.id, name: locations.name },
      orgUnit: { id: orgUnits.id, name: orgUnits.name },
      designation: { id: designations.id, name: designations.name },
      grade: { id: grades.id, name: grades.name },
      costCentre: { id: costCentres.id, name: costCentres.name },
      manager: { id: manager.id, fullName: manager.fullName, employeeCode: manager.employeeCode },
    })
    .from(jobAssignments)
    .innerJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
    .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
    .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
    .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
    .leftJoin(grades, eq(grades.id, jobAssignments.gradeId))
    .leftJoin(costCentres, eq(costCentres.id, jobAssignments.costCentreId))
    .leftJoin(manager, eq(manager.id, jobAssignments.managerId))
    .where(where)
    .orderBy(desc(jobAssignments.effectiveFrom));
}

type AssignmentRow = Awaited<ReturnType<typeof selectAssignments>>[number];

export const toJobView = (r: AssignmentRow): JobAssignmentView => ({
  id: r.a.id,
  event: r.a.event,
  effectiveFrom: r.a.effectiveFrom,
  effectiveTo: r.a.effectiveTo,
  legalEntity: r.legalEntity,
  location: r.location,
  orgUnit: r.orgUnit,
  designation: r.designation,
  grade: r.grade,
  costCentre: r.costCentre,
  manager: r.manager,
  employmentType: r.a.employmentType,
  workerCategory: r.a.workerCategory,
  reason: r.a.reason,
  createdAt: r.a.createdAt.toISOString(),
});

/** The row in force today; for someone who has not joined yet, their first assignment. */
export function currentOf(history: JobAssignmentView[], today: string): JobAssignmentView | null {
  return (
    history.find(
      (j) => j.effectiveFrom <= today && (j.effectiveTo === null || j.effectiveTo >= today),
    ) ??
    history.at(-1) ??
    null
  );
}
