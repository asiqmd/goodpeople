import {
  applications,
  designations,
  employees,
  grades,
  jobOpenings,
  legalEntities,
  locations,
  orgUnits,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  APPLICATION_STAGES,
  type OpeningListItem,
  type OpeningStageCounts,
  type OpeningView,
} from '@gp/shared';
import { count, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { loadSteps } from '../approvals/approval-views.js';

export type OpeningRow = typeof jobOpenings.$inferSelect;

const manager = alias(employees, 'hiring_manager');
const replaced = alias(employees, 'replaced');

/** Openings with the names of everything they point at. */
export function selectOpenings(tx: Tx, where: SQL | undefined) {
  return tx
    .select({
      o: jobOpenings,
      legalEntity: { id: legalEntities.id, name: legalEntities.name },
      orgUnit: { id: orgUnits.id, name: orgUnits.name },
      location: { id: locations.id, name: locations.name },
      designation: { id: designations.id, name: designations.name },
      grade: { id: grades.id, name: grades.name },
      manager: {
        id: manager.id,
        employeeCode: manager.employeeCode,
        fullName: manager.fullName,
        fullNameBn: manager.fullNameBn,
      },
      replaced: {
        id: replaced.id,
        employeeCode: replaced.employeeCode,
        fullName: replaced.fullName,
        fullNameBn: replaced.fullNameBn,
      },
      createdBy: { id: tenantUsers.id, name: tenantUsers.name },
    })
    .from(jobOpenings)
    .innerJoin(legalEntities, eq(legalEntities.id, jobOpenings.legalEntityId))
    .leftJoin(orgUnits, eq(orgUnits.id, jobOpenings.orgUnitId))
    .leftJoin(locations, eq(locations.id, jobOpenings.locationId))
    .leftJoin(designations, eq(designations.id, jobOpenings.designationId))
    .leftJoin(grades, eq(grades.id, jobOpenings.gradeId))
    .leftJoin(manager, eq(manager.id, jobOpenings.hiringManagerEmployeeId))
    .leftJoin(replaced, eq(replaced.id, jobOpenings.replacesEmployeeId))
    .leftJoin(tenantUsers, eq(tenantUsers.id, jobOpenings.createdByUserId))
    .where(where);
}

type SelectedOpening = Awaited<ReturnType<typeof selectOpenings>>[number];

const noCounts = (): OpeningStageCounts =>
  Object.fromEntries(APPLICATION_STAGES.map((s) => [s, 0])) as OpeningStageCounts;

/** Applications to each of these openings by stage. */
export async function stageCounts(
  tx: Tx,
  openingIds: string[],
): Promise<Map<string, OpeningStageCounts>> {
  const out = new Map(openingIds.map((id) => [id, noCounts()]));
  if (openingIds.length === 0) return out;
  const rows = await tx
    .select({ openingId: applications.openingId, stage: applications.stage, n: count() })
    .from(applications)
    .where(inArray(applications.openingId, openingIds))
    .groupBy(applications.openingId, applications.stage);
  for (const r of rows) out.get(r.openingId)![r.stage] = r.n;
  return out;
}

const total = (counts: OpeningStageCounts) => Object.values(counts).reduce((a, b) => a + b, 0);

export function listItemOf(r: SelectedOpening, counts: OpeningStageCounts): OpeningListItem {
  const o = r.o;
  return {
    id: o.id,
    title: o.title,
    postTitleEn: o.postTitleEn,
    postTitleBn: o.postTitleBn,
    status: o.status,
    legalEntity: r.legalEntity,
    location: r.location,
    designation: r.designation,
    employmentType: o.employmentType,
    headcount: o.headcount,
    hiringManager: r.manager,
    closesOn: o.closesOn,
    publishedAt: o.publishedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    counts,
    applications: total(counts),
  };
}

/** Full views of these openings (with their approval rounds and counts), in the given order. */
export async function openingViews(tx: Tx, rows: SelectedOpening[]): Promise<OpeningView[]> {
  const ids = rows.map((r) => r.o.id);
  const steps = await loadSteps(tx, 'job_opening', ids);
  const counts = await stageCounts(tx, ids);
  return rows.map((r) => {
    const o = r.o;
    const c = counts.get(o.id)!;
    return {
      id: o.id,
      status: o.status,
      title: o.title,
      legalEntity: r.legalEntity,
      orgUnit: r.orgUnit,
      location: r.location,
      designation: r.designation,
      grade: r.grade,
      employmentType: o.employmentType,
      headcount: o.headcount,
      reason: o.reason,
      replaces: r.replaced,
      budgetMin: o.budgetMin,
      budgetMax: o.budgetMax,
      justification: o.justification,
      hiringManager: r.manager,
      scorecardCriteria: o.scorecardCriteria,
      postTitleEn: o.postTitleEn,
      postTitleBn: o.postTitleBn,
      descriptionEn: o.descriptionEn,
      descriptionBn: o.descriptionBn,
      showSalary: o.showSalary,
      closesOn: o.closesOn,
      publishedAt: o.publishedAt?.toISOString() ?? null,
      closedAt: o.closedAt?.toISOString() ?? null,
      createdBy: r.createdBy,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      steps: steps.get(o.id) ?? [],
      counts: c,
      applications: total(c),
    };
  });
}
