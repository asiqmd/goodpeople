import { Inject, Injectable } from '@nestjs/common';
import { entitlementGrants, plans, subscriptions, tenants, type Database } from '@gp/db';
import { resolveAccess, type TenantSummary, type TenantWithAccess } from '@gp/shared';
import { asc, eq, inArray, type SQL } from 'drizzle-orm';
import { DB } from '../../db/db.module.js';

type TenantRow = typeof tenants.$inferSelect;

export function toTenantSummary(
  row: TenantRow,
  planCode: TenantSummary['planCode'],
): TenantSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    countryPack: row.countryPack,
    industryTemplate: row.industryTemplate,
    status: row.status,
    billingMode: row.billingMode,
    planCode,
    accessExpiresAt: row.accessExpiresAt?.toISOString() ?? null,
    limitOverrides: row.limitOverrides,
    bypassReason: row.bypassReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Loads tenants with their plan, subscription and grants, and resolves what each may do now. */
@Injectable()
export class EntitlementsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async forTenant(tenantId: string, now = new Date()): Promise<TenantWithAccess | null> {
    const [tenant] = await this.load(eq(tenants.id, tenantId), now);
    return tenant ?? null;
  }

  all(now = new Date()): Promise<TenantWithAccess[]> {
    return this.load(undefined, now);
  }

  private async load(where: SQL | undefined, now: Date): Promise<TenantWithAccess[]> {
    const rows = await this.db
      .select({ tenant: tenants, plan: plans })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(where)
      .orderBy(asc(tenants.createdAt));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.tenant.id);
    const [subs, grants] = await Promise.all([
      this.db.select().from(subscriptions).where(inArray(subscriptions.tenantId, ids)),
      this.db.select().from(entitlementGrants).where(inArray(entitlementGrants.tenantId, ids)),
    ]);

    return rows.map(({ tenant, plan }) => {
      const sub = subs.find((s) => s.tenantId === tenant.id);
      const access = resolveAccess({
        tenant,
        plan,
        // Only `paid` tenants consult this; resolveAccess ignores it for every other mode.
        subscription: sub
          ? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, graceDays: sub.graceDays }
          : null,
        grants: grants.filter((g) => g.tenantId === tenant.id),
        now,
      });
      return { ...toTenantSummary(tenant, plan.code), access };
    });
  }
}
