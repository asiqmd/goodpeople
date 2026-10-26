import { employees, type Tx } from '@gp/db';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { entityScope, entityScopeOf } from './entity-scope.js';

// Checks for one person or one company against the companies a login is limited to. Lists take
// `entityScope` as a condition instead. Someone outside the scope is not found when read; a
// change to them, or a hire or move into another company, is refused as outside the scope.

const outsideScope = () =>
  forbidden('outside_scope', 'This person works for a company you do not look after');

/** Whether the user may see this employee: true when not limited or when there is no such one. */
export async function inScope(tx: Tx, user: AuthUser, employeeId: string): Promise<boolean> {
  const scope = await entityScope(tx, user, employees.id);
  if (!scope) return true;
  const [row] = await tx
    .select({ visible: sql<boolean>`${scope}` })
    .from(employees)
    .where(eq(employees.id, employeeId));
  // Someone who does not exist is left to the caller's own "not found".
  return row?.visible ?? true;
}

export async function mustChangeEmployee(tx: Tx, user: AuthUser, employeeId: string) {
  if (!(await inScope(tx, user, employeeId))) throw outsideScope();
}

/** Hiring into, or moving someone to, a company the user does not look after is refused. */
export async function mustUseCompany(tx: Tx, user: AuthUser, legalEntityId: string) {
  if (user.kind !== 'tenant') return;
  const entities = await entityScopeOf(tx, user.id);
  if (entities && !entities.includes(legalEntityId)) throw outsideScope();
}

/**
 * The people of a list the scope (a condition on `employees.id`) lets the user see, for lists
 * read by shared queries that take no extra condition.
 */
export async function keepVisible<T extends { id: string }>(
  tx: Tx,
  scope: SQL | undefined,
  people: T[],
): Promise<T[]> {
  if (!scope || people.length === 0) return people;
  const visible = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        inArray(
          employees.id,
          people.map((p) => p.id),
        ),
        scope,
      ),
    );
  const ids = new Set(visible.map((v) => v.id));
  return people.filter((p) => ids.has(p.id));
}
