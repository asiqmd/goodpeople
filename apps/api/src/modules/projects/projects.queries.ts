import { NotFoundException } from '@nestjs/common';
import { donors, employeeAllocations, employees, legalEntities, projects, type Tx } from '@gp/db';
import type { AllocationView, DonorView, ProjectView } from '@gp/shared';
import { asc, eq, type SQL } from 'drizzle-orm';
import { employeeRef } from '../attendance/attendance-views.js';

export type ProjectRow = typeof projects.$inferSelect;

export const toDonorView = (d: typeof donors.$inferSelect): DonorView => ({
  id: d.id,
  code: d.code,
  name: d.name,
  country: d.country,
  isActive: d.isActive,
  createdAt: d.createdAt.toISOString(),
});

/** Projects with their company and donor, by code. */
export async function selectProjects(tx: Tx, where?: SQL): Promise<ProjectView[]> {
  const rows = await tx
    .select({
      project: projects,
      entity: { id: legalEntities.id, name: legalEntities.name },
      donor: { id: donors.id, code: donors.code, name: donors.name },
    })
    .from(projects)
    .innerJoin(legalEntities, eq(legalEntities.id, projects.legalEntityId))
    .leftJoin(donors, eq(donors.id, projects.donorId))
    .where(where)
    .orderBy(asc(projects.code));
  return rows.map(({ project: p, entity, donor }) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    nameBn: p.nameBn,
    legalEntity: entity,
    donor: donor?.id ? donor : null,
    grantReference: p.grantReference,
    fd6ApprovalNo: p.fd6ApprovalNo,
    fd6ApprovedOn: p.fd6ApprovedOn,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    approvedBudget: p.approvedBudget,
    staffBudget: p.staffBudget,
    status: p.status,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function projectOf(tx: Tx, id: string): Promise<ProjectView> {
  const [found] = await selectProjects(tx, eq(projects.id, id));
  if (!found) throw new NotFoundException('Project not found');
  return found;
}

/** Allocations with the person and the project, earliest first. */
export async function selectAllocations(tx: Tx, where: SQL): Promise<AllocationView[]> {
  const rows = await tx
    .select({ allocation: employeeAllocations, employee: employees, project: projects })
    .from(employeeAllocations)
    .innerJoin(employees, eq(employees.id, employeeAllocations.employeeId))
    .innerJoin(projects, eq(projects.id, employeeAllocations.projectId))
    .where(where)
    .orderBy(
      asc(employeeAllocations.fromOn),
      asc(employees.employeeCode),
      asc(employeeAllocations.createdAt),
    );
  return rows.map(({ allocation: a, employee, project }) => ({
    id: a.id,
    employee: employeeRef(employee),
    project: { id: project.id, code: project.code, name: project.name, status: project.status },
    percent: a.percent,
    costKind: a.costKind,
    fromOn: a.fromOn,
    toOn: a.toOn,
    createdAt: a.createdAt.toISOString(),
  }));
}
