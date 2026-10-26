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
import { and, desc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { entityScope } from '../access-scopes/entity-scope.js';

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

type EmployeeRow = typeof employees.$inferSelect;

/** The employee record linked to a workspace login, if any. */
export async function employeeOfUser(tx: Tx, userId: string): Promise<EmployeeRow | null> {
  const [row] = await tx.select().from(employees).where(eq(employees.userId, userId));
  return row ?? null;
}

/** A unit and every unit below it. */
export async function unitAndBelow(tx: Tx, unitId: string): Promise<string[]> {
  const all = await tx.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
  const ids = [unitId];
  for (let i = 0; i < ids.length; i++) {
    ids.push(...all.filter((u) => u.parentId === ids[i]).map((u) => u.id));
  }
  return ids;
}

/** Employees whose job on a date sits in one of these units, as a subquery. */
export const employeesInUnits = (tx: Tx, units: string[], onDate: string) =>
  tx
    .select({ id: jobAssignments.employeeId })
    .from(jobAssignments)
    .where(and(inArray(jobAssignments.orgUnitId, units), inForceOn(onDate)));

/**
 * Whose team-level data a user may see, as a condition on an employee id column. Anyone who
 * may read every employee sees everyone in the companies they look after (or one unit and
 * below); others see themselves, their direct reports and colleagues in their own unit.
 * null: the user has no employee record and is not HR.
 */
export async function teamScope(
  tx: Tx,
  user: AuthUser,
  employeeId: AnyPgColumn,
  options: { onDate: string; orgUnitId?: string },
): Promise<SQL | undefined | null> {
  if (userCan(user, 'employees.read')) {
    const companies = await entityScope(tx, user, employeeId);
    if (!options.orgUnitId) return companies;
    const units = await unitAndBelow(tx, options.orgUnitId);
    return and(companies, inArray(employeeId, employeesInUnits(tx, units, options.onDate)));
  }
  const me = await employeeOfUser(tx, user.id);
  if (!me) return null;
  const [myJob] = await tx
    .select()
    .from(jobAssignments)
    .where(and(eq(jobAssignments.employeeId, me.id), inForceOn(options.onDate)));
  const reports = tx
    .select({ id: jobAssignments.employeeId })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.managerId, me.id), inForceOn(options.onDate)));
  return or(
    eq(employeeId, me.id),
    inArray(employeeId, reports),
    myJob?.orgUnitId
      ? inArray(employeeId, employeesInUnits(tx, [myJob.orgUnitId], options.onDate))
      : undefined,
  );
}
