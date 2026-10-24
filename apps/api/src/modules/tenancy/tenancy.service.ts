import { Injectable, NotFoundException } from '@nestjs/common';
import { legalEntities } from '@gp/db';
import type { CreateLegalEntityInput, LegalEntity, TenantWithAccess } from '@gp/shared';
import { asc, count, eq } from 'drizzle-orm';
import { forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';

const toLegalEntity = (row: typeof legalEntities.$inferSelect): LegalEntity => ({
  id: row.id,
  name: row.name,
  tin: row.tin,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Tenant data. Every query runs through TenantDb, so row-level security limits it to the
 * caller's tenant: there is deliberately no tenant_id filter in these queries.
 */
@Injectable()
export class TenancyService {
  constructor(private readonly tenantDb: TenantDb) {}

  listLegalEntities(): Promise<LegalEntity[]> {
    return this.tenantDb.run(async (tx) =>
      (await tx.select().from(legalEntities).orderBy(asc(legalEntities.createdAt))).map(
        toLegalEntity,
      ),
    );
  }

  async getLegalEntity(id: string): Promise<LegalEntity> {
    const [row] = await this.tenantDb.run((tx) =>
      tx.select().from(legalEntities).where(eq(legalEntities.id, id)),
    );
    if (!row) throw new NotFoundException('Legal entity not found');
    return toLegalEntity(row);
  }

  async createLegalEntity(
    tenant: TenantWithAccess,
    input: CreateLegalEntityInput,
  ): Promise<LegalEntity> {
    const limit = tenant.access.limits.max_legal_entities;
    return this.tenantDb.run(async (tx) => {
      const [{ value: existing } = { value: 0 }] = await tx
        .select({ value: count() })
        .from(legalEntities);
      if (limit !== null && existing >= limit) {
        throw forbidden(
          'limit_reached',
          `Your plan allows ${limit} legal entit${limit === 1 ? 'y' : 'ies'}`,
        );
      }
      const [row] = await tx
        .insert(legalEntities)
        .values({ tenantId: currentTenantId(), name: input.name, tin: input.tin ?? null })
        .returning();
      return toLegalEntity(row!);
    });
  }
}
