import {
  employees,
  jobAssignments,
  legalEntities,
  tenantUsers,
  userEntityScopes,
  type Tx,
} from '@gp/db';
import { policyCan, type Permission } from '@gp/shared';
import { and, eq, gt, inArray, notExists, or, sql, type SQL } from 'drizzle-orm';
import { currentAuthUser } from '../../common/request-context.js';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../../common/auth-user.js';

/**
 * The companies a login is limited to, or null when it sees every company (no scope rows,
 * which is every login until someone limits it).
 */
export async function entityScopeOf(tx: Tx, userId: string): Promise<string[] | null> {
  const user = currentAuthUser();
  if (user?.kind === 'tenant' && user.id === userId && user.policy?.custom) {
    const all = await tx.select({ id: legalEntities.id }).from(legalEntities);
    const permissions = user.scopePermissions?.length
      ? user.scopePermissions
      : ['employees.read' as Permission];
    return all
      .filter((c) => permissions.every((p) => policyCan(user.policy!, p, c.id)))
      .map((c) => c.id);
  }
  const [login] = await tx
    .select({ mode: tenantUsers.scopeMode })
    .from(tenantUsers)
    .where(eq(tenantUsers.id, userId));
  if (login?.mode === 'none') return [];
  const rows = await tx
    .select({ legalEntityId: userEntityScopes.legalEntityId })
    .from(userEntityScopes)
    .where(eq(userEntityScopes.userId, userId));
  return login?.mode === 'selected' || rows.length ? rows.map((r) => r.legalEntityId) : null;
}

const later = alias(jobAssignments, 'later_job');

/**
 * Employees whose latest job is with one of these companies, as a subquery. The latest job,
 * not the one in force, so people who have left stay with the company they left.
 */
export const employeesOfEntities = (tx: Tx, entityIds: string[]) =>
  tx
    .select({ id: jobAssignments.employeeId })
    .from(jobAssignments)
    .where(
      and(
        inArray(jobAssignments.legalEntityId, entityIds),
        notExists(
          tx
            .select({ id: later.id })
            .from(later)
            .where(
              and(
                eq(later.employeeId, jobAssignments.employeeId),
                gt(later.effectiveFrom, jobAssignments.effectiveFrom),
              ),
            ),
        ),
      ),
    );

/**
 * A condition on an employee id column limiting it to the companies the user may see;
 * undefined when the user is not limited.
 */
export async function entityScope(
  tx: Tx,
  user: AuthUser,
  employeeId: AnyPgColumn,
): Promise<SQL | undefined> {
  if (user.kind !== 'tenant') return undefined;
  if (user.policy?.custom) {
    const permissions = user.scopePermissions?.length
      ? user.scopePermissions
      : ['employees.read' as Permission];
    const clauses = permissions.map((p) => {
      const matching = user.policy!.grants.filter(
        (g) => g.permissions.includes(p) && g.scope !== 'none',
      );
      const allows = matching.map((g) => {
        const company =
          g.scope === 'all'
            ? undefined
            : inArray(employeeId, employeesOfEntities(tx, g.companyIds));
        const relationship =
          g.relationship === 'all'
            ? undefined
            : g.relationship === 'own'
              ? inArray(
                  employeeId,
                  tx
                    .select({ id: employees.id })
                    .from(employees)
                    .where(eq(employees.userId, user.id)),
                )
              : inArray(
                  employeeId,
                  tx
                    .select({ id: jobAssignments.employeeId })
                    .from(jobAssignments)
                    .where(
                      and(
                        inArray(
                          jobAssignments.managerId,
                          tx
                            .select({ id: employees.id })
                            .from(employees)
                            .where(eq(employees.userId, user.id)),
                        ),
                        notExists(
                          tx
                            .select({ id: later.id })
                            .from(later)
                            .where(
                              and(
                                eq(later.employeeId, jobAssignments.employeeId),
                                gt(later.effectiveFrom, jobAssignments.effectiveFrom),
                              ),
                            ),
                        ),
                      ),
                    ),
                );
        return and(company, relationship) ?? sql`true`;
      });
      const denied = user.policy!.grants.filter(
        (g) => g.deniedPermissions.includes(p) && g.scope !== 'none',
      );
      if (denied.some((g) => g.scope === 'all')) return sql`false`;
      const excluded = denied.flatMap((g) => g.companyIds);
      return and(
        allows.length ? or(...allows) : sql`false`,
        excluded.length
          ? sql`not (${inArray(employeeId, employeesOfEntities(tx, excluded))})`
          : undefined,
      )!;
    });
    return and(...clauses) ?? sql`false`;
  }
  const entities = await entityScopeOf(tx, user.id);
  return entities ? inArray(employeeId, employeesOfEntities(tx, entities)) : undefined;
}
