import {
  employees,
  jobAssignments,
  learningCertificates,
  learningCourses,
  learningRequirements,
  legalEntities,
  designations,
  type Tx,
} from '@gp/db';
import {
  addDays,
  groupBy,
  trainingDueOn,
  trainingState,
  type TrainingCoverageRow,
} from '@gp/shared';
import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { employeeRef } from '../attendance/attendance-views.js';

/** Preserve the start of a continuous company/designation across unrelated job changes. */
interface DesignationJob {
  effectiveFrom: string;
  effectiveTo: string | null;
  legalEntityId: string;
  designationId: string | null;
}
export function designationStart(
  current: DesignationJob,
  history: readonly DesignationJob[],
): string {
  let start = current.effectiveFrom;
  for (const older of history
    .filter((j) => j.effectiveFrom < current.effectiveFrom)
    .toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))) {
    if (
      older.legalEntityId !== current.legalEntityId ||
      older.designationId !== current.designationId ||
      older.effectiveTo !== addDays(start, -1)
    )
      break;
    start = older.effectiveFrom;
  }
  return start;
}
export interface CoverageScope {
  entityIds?: string[] | null;
  employeeIds?: string[];
  locationId?: string;
}
export async function trainingCoverage(
  tx: Tx,
  on: string,
  scope: CoverageScope = {},
): Promise<TrainingCoverageRow[]> {
  if (scope.entityIds?.length === 0 || scope.employeeIds?.length === 0) return [];
  const people = await tx
    .select()
    .from(employees)
    .where(
      and(
        lte(employees.joinedOn, on),
        or(isNull(employees.separatedOn), gte(employees.separatedOn, on)),
        scope.employeeIds ? inArray(employees.id, scope.employeeIds) : undefined,
      ),
    );
  const jobs = await tx
    .select()
    .from(jobAssignments)
    .where(lte(jobAssignments.effectiveFrom, on))
    .orderBy(desc(jobAssignments.effectiveFrom));
  const policies = await tx
    .select({
      r: learningRequirements,
      course: learningCourses,
      company: { id: legalEntities.id, name: legalEntities.name },
      designation: { id: designations.id, name: designations.name },
    })
    .from(learningRequirements)
    .innerJoin(learningCourses, eq(learningCourses.id, learningRequirements.courseId))
    .innerJoin(legalEntities, eq(legalEntities.id, learningRequirements.legalEntityId))
    .innerJoin(designations, eq(designations.id, learningRequirements.designationId))
    .where(
      and(
        lte(learningRequirements.effectiveFrom, on),
        or(isNull(learningRequirements.effectiveTo), gte(learningRequirements.effectiveTo, on)),
      ),
    );
  const certificates = await tx
    .select()
    .from(learningCertificates)
    .where(and(lte(learningCertificates.completedOn, on), isNull(learningCertificates.revokedAt)));
  const jobsByPerson = groupBy(jobs, (j) => j.employeeId);
  const certificatesByPersonCourse = groupBy(certificates, (c) => `${c.employeeId}:${c.courseId}`);
  const policiesByPosition = groupBy(policies, (p) => `${p.r.legalEntityId}:${p.r.designationId}`);
  const result: TrainingCoverageRow[] = [];
  for (const person of people) {
    const history = jobsByPerson.get(person.id) ?? [];
    const job = history.find((j) => !j.effectiveTo || j.effectiveTo >= on);
    if (
      !job ||
      (scope.entityIds && !scope.entityIds.includes(job.legalEntityId)) ||
      (scope.locationId && job.locationId !== scope.locationId)
    )
      continue;
    const start = designationStart(job, history);
    for (const { r, course, company, designation } of policiesByPosition.get(
      `${job.legalEntityId}:${job.designationId}`,
    ) ?? []) {
      const own = (certificatesByPersonCourse.get(`${person.id}:${course.id}`) ?? []).toSorted(
        (a, b) => b.completedOn.localeCompare(a.completedOn),
      );
      const valid = own.find((c) => !c.expiresOn || c.expiresOn >= on);
      const dueOn = trainingDueOn(start, r.effectiveFrom, r.graceDays);
      result.push({
        employee: employeeRef(person),
        company,
        designation,
        course,
        state: trainingState(on, dueOn, own),
        dueOn,
        expiresOn: (valid ?? own[0])?.expiresOn ?? null,
        certificateId: valid?.id ?? null,
      });
    }
  }
  return result;
}
