import { jobAssignments, userEntityScopes, type Tx } from '@gp/db';
import { and, eq, gt, inArray, notExists, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../../common/auth-user.js';

/**
 * The companies a login is limited to, or null when it sees every company (no scope rows,
 * which is every login until someone limits it).
 */
export async function entityScopeOf(tx: Tx, userId: string): Promise<string[] | null> {
  const rows = await tx
    .select({ legalEntityId: userEntityScopes.legalEntityId })
    .from(userEntityScopes)
    .where(eq(userEntityScopes.userId, userId));
  return rows.length ? rows.map((r) => r.legalEntityId) : null;
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
  const entities = await entityScopeOf(tx, user.id);
  return entities ? inArray(employeeId, employeesOfEntities(tx, entities)) : undefined;
}
