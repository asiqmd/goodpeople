import { UnauthorizedException } from '@nestjs/common';
import {
  externalIdentities,
  identityConnections,
  scimUsers,
  type authSessions,
  type tenantUsers,
  type Tx,
} from '@gp/db';
import { and, eq } from 'drizzle-orm';
import { policyOf } from '../../common/authority.js';

/** Resolve policy only for a login that still meets the session's identity requirements. */
export async function tenantSessionPolicy(
  tx: Tx,
  u: typeof tenantUsers.$inferSelect,
  session: typeof authSessions.$inferSelect,
) {
  const enforced = await tx
    .select({ id: identityConnections.id })
    .from(identityConnections)
    .innerJoin(externalIdentities, eq(externalIdentities.connectionId, identityConnections.id))
    .where(and(eq(identityConnections.enforced, true), eq(externalIdentities.userId, u.id)));
  const managed = await tx
    .select({ id: scimUsers.id })
    .from(scimUsers)
    .where(eq(scimUsers.userId, u.id))
    .limit(1);
  if (
    !u.emergencyLocal &&
    u.role !== 'support' &&
    ((enforced.length && !enforced.some((c) => session.authMethod === `sso:${c.id}`)) ||
      (managed.length && !session.authMethod.startsWith('sso:')))
  )
    throw new UnauthorizedException('SSO required');
  if (session.authMethod.startsWith('sso:')) {
    const [connection] = await tx
      .select({ enabled: identityConnections.enabled })
      .from(identityConnections)
      .where(eq(identityConnections.id, session.authMethod.slice(4)));
    if (!connection?.enabled) throw new UnauthorizedException('Connection disabled');
  }
  return policyOf(tx, u);
}
