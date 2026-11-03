import { localParts } from '@gp/shared';
import { runAsTenant, companyLegalProfiles } from '@gp/db';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { Inject, Injectable } from '@nestjs/common';
import {
  entitlementGrants,
  plans,
  subscriptions,
  tenants,
  readInstallationLicense,
  type Database,
} from '@gp/db';
import { resolveAccess, type TenantSummary, type TenantWithAccess } from '@gp/shared';
import { asc, eq, inArray, and, sql, type SQL } from 'drizzle-orm';
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
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {}

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
      .where(
        and(
          where,
          this.config.DEPLOYMENT_MODE !== 'managed'
            ? eq(tenants.id, this.config.INSTALLATION_TENANT_ID!)
            : sql`not exists(select 1 from tenant_placements p where p.tenant_id=${tenants.id} and p.status='active')`,
        ),
      )
      .orderBy(asc(tenants.createdAt));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.tenant.id);
    const [subs, grants] = await Promise.all([
      this.db.select().from(subscriptions).where(inArray(subscriptions.tenantId, ids)),
      this.db.select().from(entitlementGrants).where(inArray(entitlementGrants.tenantId, ids)),
    ]);

    const installed =
      this.config.DEPLOYMENT_MODE !== 'managed'
        ? await readInstallationLicense(this.db, {
            installationId: this.config.INSTALLATION_ID!,
            tenantId: this.config.INSTALLATION_TENANT_ID!,
            keys: this.config.LICENSE_PUBLIC_KEYS_JSON,
          })
        : null;
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
      if (installed) {
        access.features = installed.features;
        access.limits = installed.limits;
        access.subscriptionChecked = false;
        if (access.accessState !== 'suspended') {
          access.accessState =
            tenant.status === 'read_only' || !['valid', 'grace'].includes(installed.state)
              ? 'read_only'
              : 'full';
          if (installed.state === 'recovery_pending') access.accessState = 'suspended';
          access.reason =
            installed.state === 'recovery_pending'
              ? 'license_recovery_pending'
              : installed.state === 'valid'
                ? 'license'
                : installed.state === 'grace'
                  ? 'license_grace'
                  : installed.state === 'expired'
                    ? 'license_expired'
                    : installed.state === 'missing'
                      ? 'license_missing'
                      : installed.state === 'clock_rollback'
                        ? 'license_clock_rollback'
                        : 'license_invalid';
        }
      }
      return { ...toTenantSummary(tenant, plan.code), access };
    });
  }
  async businessContext(tenantId: string) {
    const profiles = await runAsTenant(this.db, tenantId, (tx) =>
      tx.select().from(companyLegalProfiles),
    );
    const active = profiles.filter((p) => {
        const date = localParts(new Date(), p.businessTimeZone).date;
        return p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo >= date);
      }),
      zones = [...new Set(active.map((p) => p.businessTimeZone))];
    return {
      zone: zones.length > 1 ? 'explicit_required' : (zones[0] ?? 'Asia/Dhaka'),
      blocked: active.some((p) => p.countryCode !== 'BD' || p.calendar !== 'gregorian'),
    };
  }
}
