import { accessAssignments, accessRoles, legalEntities, tenantUsers, type Tx } from '@gp/db';
import { policyCan, type AccessPolicy, type Permission } from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { AuthUser } from './auth-user.js';

export async function policyOf(
  tx: Tx,
  user: typeof tenantUsers.$inferSelect,
): Promise<AccessPolicy> {
  if (user.accessMode === 'template') return { custom: false, grants: [] };
  const rows = await tx
    .select({ assignment: accessAssignments, role: accessRoles })
    .from(accessAssignments)
    .innerJoin(accessRoles, eq(accessRoles.id, accessAssignments.roleId))
    .where(eq(accessAssignments.userId, user.id));
  const companies = (await tx.select({ id: legalEntities.id }).from(legalEntities)).map(
    (c) => c.id,
  );
  return {
    custom: true,
    companies,
    grants: rows.map(({ assignment: a, role: r }) => ({
      id: a.id,
      roleId: r.id,
      name: r.name,
      permissions: r.permissions,
      deniedPermissions: r.deniedPermissions,
      fields: r.fields,
      scope: a.scope,
      companyIds: a.companyIds,
      relationship: a.relationship,
      source: a.source,
    })),
  };
}

/** Primary permission for controllers that combine employee and HR views. */
export function permissionForPath(path: string): Permission | undefined {
  const routes: [RegExp, Permission][] = [
    [/\/tenant\/analytics/, 'analytics.view'],
    [/\/tenant\/international\/banks/, 'employees.write'],
    [/\/tenant\/international\/(employees|identifiers|employment-profiles)/, 'employees.identity'],
    [/\/tenant\/international/, 'org.manage'],
    [/\/tenant\/(performance|goals|reviews|development)/, 'performance.manage'],
    [/\/tenant\/compensation/, 'compensation.manage'],
    [/\/tenant\/learning/, 'learning.manage'],
    [/\/tenant\/(engagement|announcements|recognitions)/, 'engagement.manage'],
    [/\/tenant\/(employee-services|assets|hr-requests)/, 'employee_services.manage'],
    [/\/tenant\/(recruitment|applications|offers|interviews)/, 'recruitment.manage'],
    [/\/tenant\/(payroll|pay-groups|pay-components|salary-structures)/, 'payroll.view'],
    [/\/tenant\/employees/, 'employees.read'],
    [/\/tenant\/attendance/, 'attendance.manage'],
    [/\/tenant\/leave/, 'leave.manage'],
    [/\/tenant\/(lifecycle|separations)/, 'lifecycle.manage'],
    [/\/tenant\/(documents|letters)/, 'documents.manage'],
    [/\/tenant\/(projects|timesheets)/, 'projects.manage'],
    [/\/tenant\/(compliance|audit-report|maternity)/, 'compliance.manage'],
    [/\/tenant\/grievances/, 'grievances.manage'],
    [/\/tenant\/group/, 'employees.read'],
    [/\/tenant\/org/, 'org.manage'],
  ];
  return routes.find(([pattern]) => pattern.test(path))?.[1];
}
export function requiredPermission(user: AuthUser): Permission | undefined {
  return user.kind === 'tenant' ? user.scopePermissions?.[0] : undefined;
}
export function permittedCompanies(
  policy: AccessPolicy,
  permission: Permission,
  all: string[],
): string[] {
  return all.filter((id) => policyCan(policy, permission, id));
}
