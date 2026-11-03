import { Injectable, NotFoundException } from '@nestjs/common';
import { legalEntities, tenantUsers, userEntityScopes, type Tx } from '@gp/db';
import type { UserEntityScopeInput, UserEntityScopeView } from '@gp/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';

/** The companies a login is limited to, for admins managing logins. */
@Injectable()
export class AccessScopesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  get(userId: string): Promise<UserEntityScopeView> {
    return this.tenantDb.run(async (tx) => {
      await this.login(tx, userId);
      return this.view(tx, userId);
    });
  }

  /** Limits a login to these companies; none lets it see every company again. */
  set(actor: AuthUser, userId: string, input: UserEntityScopeInput): Promise<UserEntityScopeView> {
    return this.tenantDb.run(async (tx) => {
      const login = await this.login(tx, userId);
      const ids = input.legalEntityIds;
      if (ids.length && login.role === 'tenant_admin') {
        throw badRequest('scope_not_for_admin', 'A workspace admin always sees every company');
      }
      if (ids.length) {
        const found = await tx
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(inArray(legalEntities.id, ids));
        if (found.length !== ids.length) {
          throw badRequest('unknown_company', 'Choose companies of this workspace');
        }
      }
      const before = await this.view(tx, userId);
      await tx
        .update(tenantUsers)
        .set({ scopeMode: ids.length ? 'selected' : 'all' })
        .where(eq(tenantUsers.id, userId));
      await tx.delete(userEntityScopes).where(eq(userEntityScopes.userId, userId));
      if (ids.length) {
        await tx.insert(userEntityScopes).values(
          ids.map((legalEntityId) => ({
            tenantId: currentTenantId(),
            userId,
            legalEntityId,
            createdBy: actor.id,
          })),
        );
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'user.scope',
        entityType: 'tenant_user',
        entityId: userId,
        before: { legalEntityIds: before.legalEntities.map((e) => e.id) },
        after: input,
      });
      return this.view(tx, userId);
    });
  }

  private async login(tx: Tx, id: string) {
    const [user] = await tx
      .select({ id: tenantUsers.id, role: tenantUsers.role })
      .from(tenantUsers)
      .where(eq(tenantUsers.id, id));
    if (!user) throw new NotFoundException('Login not found');
    return user;
  }

  private async view(tx: Tx, userId: string): Promise<UserEntityScopeView> {
    const rows = await tx
      .select({ id: legalEntities.id, code: legalEntities.code, name: legalEntities.name })
      .from(userEntityScopes)
      .innerJoin(legalEntities, eq(legalEntities.id, userEntityScopes.legalEntityId))
      .where(eq(userEntityScopes.userId, userId))
      .orderBy(asc(legalEntities.name));
    return { userId, legalEntities: rows };
  }
}
