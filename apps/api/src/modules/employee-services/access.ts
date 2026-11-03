import { employees, jobAssignments, legalEntities, tenantUsers, type Tx } from '@gp/db';
import { todayIn, type Permission } from '@gp/shared';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { userCan } from '../../common/roles.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { employeeOfUser, inForceOn } from '../employees/employee.queries.js';
export const serviceMissing = () => new NotFoundException('Employee service record not found');
export async function serviceActor(tx: Tx, user: AuthUser, permission: Permission) {
  const employee = await employeeOfUser(tx, user.id);
  const active =
    employee &&
    employee.joinedOn <= todayIn() &&
    (!employee.separatedOn || employee.separatedOn >= todayIn());
  const [job] = active
    ? await tx
        .select()
        .from(jobAssignments)
        .where(and(eq(jobAssignments.employeeId, employee.id), inForceOn(todayIn())))
    : [];
  return {
    user,
    employee,
    job: job ?? null,
    manage: userCan(user, permission),
    companies: await entityScopeOf(tx, user.id),
  };
}
export type ServiceActor = Awaited<ReturnType<typeof serviceActor>>;
export const inServiceCompany = (v: ServiceActor, id: string) =>
  !v.companies || v.companies.includes(id);
export function requireServiceEmployee(v: ServiceActor) {
  if (!v.employee || !v.job)
    throw badRequest('service_employee_required', 'An active employee record is required');
  return { employee: v.employee, job: v.job };
}
export async function managedCompany(tx: Tx, v: ServiceActor, id: string) {
  if (!v.manage || !inServiceCompany(v, id)) throw serviceMissing();
  const [company] = await tx.select().from(legalEntities).where(eq(legalEntities.id, id));
  if (!company?.isActive) throw serviceMissing();
  return company;
}
export async function companyPeople(tx: Tx, companyId: string, on = todayIn()) {
  const rows = await tx
    .select({ employee: employees })
    .from(employees)
    .innerJoin(jobAssignments, eq(jobAssignments.employeeId, employees.id))
    .where(
      and(
        eq(jobAssignments.legalEntityId, companyId),
        inForceOn(on),
        lte(employees.joinedOn, on),
        or(isNull(employees.separatedOn), gte(employees.separatedOn, on)),
      ),
    );
  return rows.map((r) => r.employee);
}
export async function serviceHandlers(tx: Tx, companyId: string) {
  const people = await tx.select().from(tenantUsers).where(isNull(tenantUsers.disabledAt));
  const result: { id: string; name: string }[] = [];
  for (const user of people) {
    const scopes = await entityScopeOf(tx, user.id);
    if (
      userCan(
        { kind: 'tenant', id: user.id, role: user.role, tenantId: user.tenantId },
        'employee_services.manage',
      ) &&
      (!scopes || scopes.includes(companyId))
    )
      result.push({ id: user.id, name: user.name });
  }
  return result;
}

/** Transaction clients execute one query at a time. */
export async function serviceViews<T, R>(items: T[], view: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (const item of items) result.push(await view(item));
  return result;
}
