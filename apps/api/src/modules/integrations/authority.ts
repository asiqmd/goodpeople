import { createHash } from 'node:crypto';
import {
  apiClients,
  apiClientCredentials,
  apiClientGrants,
  legalEntities,
  tenantUsers,
  userEntityScopes,
  type Tx,
} from '@gp/db';
import {
  can,
  policyCan,
  grantMatches,
  type ApiScope,
  type PublicField,
  type Permission,
} from '@gp/shared';
import { and, eq } from 'drizzle-orm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { policyOf } from '../../common/authority.js';
export interface ServicePrincipal {
  kind: 'service';
  id: string;
  tenantId: string;
  credentialId: string;
  version: number;
  scopes: ApiScope[];
  fields: PublicField[];
  companyIds: string[];
  authority: string;
  expiresAt: number;
}
export const requiredPermission = (scope: ApiScope): Permission =>
  scope === 'attendance:read' ? 'attendance.manage' : 'employees.read';
export const digest = (v: string) => createHash('sha256').update(v).digest('hex');
export async function ownerCompanies(
  tx: Tx,
  owner: typeof tenantUsers.$inferSelect,
  scopes: ApiScope[],
) {
  const companies = (await tx.select({ id: legalEntities.id }).from(legalEntities)).map(
    (c) => c.id,
  );
  const policy = await policyOf(tx, owner);
  const legacy =
    owner.scopeMode === 'selected'
      ? (
          await tx
            .select({ id: userEntityScopes.legalEntityId })
            .from(userEntityScopes)
            .where(eq(userEntityScopes.userId, owner.id))
        ).map((c) => c.id)
      : [];
  return companies.filter((c) =>
    scopes.every((s) =>
      policy.custom
        ? policyCan(policy, requiredPermission(s), c) &&
          policy.grants.some(
            (g) =>
              g.relationship === 'all' &&
              grantMatches(g, c) &&
              g.permissions.includes(requiredPermission(s)),
          )
        : can(owner.role, requiredPermission(s)) &&
          (owner.scopeMode === 'all' || (owner.scopeMode === 'selected' && legacy.includes(c))),
    ),
  );
}
export async function resolveService(
  tx: Tx,
  p: Pick<ServicePrincipal, 'id' | 'tenantId' | 'credentialId' | 'version' | 'scopes'>,
  lock = true,
): Promise<ServicePrincipal> {
  const [candidate] = await tx.select().from(apiClients).where(eq(apiClients.id, p.id));
  if (!candidate) throw new UnauthorizedException('Invalid service token');
  // Owner -> client -> credential is the mutation/authorization lock order.
  const owners = tx.select().from(tenantUsers).where(eq(tenantUsers.id, candidate.ownerId));
  const [owner] = await (lock ? owners.for('share') : owners);
  const clients = tx.select().from(apiClients).where(eq(apiClients.id, p.id));
  const [client] = await (lock ? clients.for('share') : clients);
  const credentials = tx
    .select()
    .from(apiClientCredentials)
    .where(
      and(eq(apiClientCredentials.id, p.credentialId), eq(apiClientCredentials.clientId, p.id)),
    );
  const [credential] = await (lock ? credentials.for('share') : credentials);
  if (
    !owner ||
    owner.disabledAt ||
    owner.provisionDisabled ||
    !client ||
    client.ownerId !== owner.id ||
    client.revokedAt ||
    client.reviewRequired ||
    client.expiresAt.getTime() <= Date.now() ||
    client.version !== p.version ||
    !credential ||
    credential.revokedAt ||
    credential.expiresAt.getTime() <= Date.now() ||
    p.scopes.some((s) => !client.scopes.includes(s))
  )
    throw new UnauthorizedException('Service access has ended');
  const [grant] = await tx.select().from(apiClientGrants).where(eq(apiClientGrants.clientId, p.id));
  const ceiling = await ownerCompanies(tx, owner, p.scopes);
  const companies = ceiling.filter(
    (c) =>
      grant &&
      (grant.scope === 'all' || (grant.scope === 'selected' && grant.companyIds.includes(c))),
  );
  if (!companies.length) throw new ForbiddenException('No granted companies');
  return {
    kind: 'service',
    id: client.id,
    tenantId: p.tenantId,
    credentialId: credential.id,
    version: client.version,
    scopes: p.scopes,
    fields: client.fields,
    companyIds: companies,
    authority: digest(
      JSON.stringify([
        client.version,
        owner.authRevision,
        companies.toSorted(),
        p.scopes.toSorted(),
        client.fields.toSorted(),
      ]),
    ),
    expiresAt: Math.min(client.expiresAt.getTime(), credential.expiresAt.getTime()),
  };
}
