import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  entitlementGrants,
  hashPassword,
  plans,
  provisionCountryDefaults,
  scopeToTenant,
  tenants,
  tenantUsers,
  type Database,
} from '@gp/db';
import {
  BYPASS_BILLING_MODES,
  PLAN_CATALOG,
  todayIn,
  type AssignCompanyInput,
  type BillingMode,
  type CreateGrantInput,
  type PlanCode,
  type PlanDefinition,
  type TenantWithAccess,
  type UpdateBillingInput,
  type AssignCompanyResult,
} from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { PlatformUser } from '../../common/auth-user.js';
import { DB } from '../../db/db.module.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

const isBypass = (mode: BillingMode) => (BYPASS_BILLING_MODES as readonly string[]).includes(mode);

/** Drops keys the form left out, so only the limits the admin set become overrides. */
const definedLimits = (limits: AssignCompanyInput['limits']) =>
  Object.fromEntries(Object.entries(limits ?? {}).filter(([, v]) => v !== undefined));

@Injectable()
export class PlatformAdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  listPlans(): readonly PlanDefinition[] {
    return PLAN_CATALOG;
  }

  listTenants(): Promise<TenantWithAccess[]> {
    return this.entitlements.all();
  }

  async getTenant(id: string): Promise<TenantWithAccess> {
    const tenant = await this.entitlements.forTenant(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /**
   * Creates a tenant and its first admin in one step. With billing mode `complimentary` or
   * `internal` the tenant never touches checkout, invoices or a subscription.
   */
  async assignCompany(
    actor: PlatformUser,
    input: AssignCompanyInput,
  ): Promise<AssignCompanyResult> {
    const planId = await this.planId(input.planCode);
    const [taken] = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug));
    if (taken) throw new ConflictException(`The workspace slug "${input.slug}" is taken`);

    const password = input.admin.password ?? randomBytes(12).toString('base64url');
    const passwordHash = await hashPassword(password);
    const adminEmail = input.admin.email.toLowerCase();
    const limitOverrides = definedLimits(input.limits);

    const { tenantId, adminId } = await this.db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          countryPack: input.countryPack,
          industryTemplate: input.industryTemplate,
          billingMode: input.billingMode,
          planId,
          accessExpiresAt: input.accessExpiresAt ? new Date(input.accessExpiresAt) : null,
          limitOverrides,
          bypassReason: isBypass(input.billingMode) ? input.reason : null,
          grantedBy: actor.id,
        })
        .returning({ id: tenants.id });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'tenant.assign',
        tenantId: tenant!.id,
        reason: input.reason,
        after: {
          billingMode: input.billingMode,
          planCode: input.planCode,
          accessExpiresAt: input.accessExpiresAt ?? null,
          limitOverrides,
          admin: adminEmail,
        },
      });
      await scopeToTenant(tx, tenant!.id);
      const [admin] = await tx
        .insert(tenantUsers)
        .values({
          tenantId: tenant!.id,
          email: adminEmail,
          name: input.admin.name,
          passwordHash,
          role: 'tenant_admin',
        })
        .returning({ id: tenantUsers.id });
      // Every new workspace starts with its country pack: statutory leave types and holidays.
      await provisionCountryDefaults(tx, tenant!.id, { countryPack: 'BD', today: todayIn() });
      return { tenantId: tenant!.id, adminId: admin!.id };
    });

    return {
      tenant: await this.getTenant(tenantId),
      admin: { id: adminId, email: adminEmail },
      ...(input.admin.password ? {} : { temporaryPassword: password }),
    };
  }

  async updateBilling(
    actor: PlatformUser,
    tenantId: string,
    input: UpdateBillingInput,
  ): Promise<TenantWithAccess> {
    const before = await this.getTenant(tenantId);
    const planCode = input.planCode ?? before.planCode;
    const planId = await this.planId(planCode);
    const accessExpiresAt =
      input.accessExpiresAt === undefined ? before.accessExpiresAt : input.accessExpiresAt;
    const limitOverrides = input.limits ? definedLimits(input.limits) : before.limitOverrides;

    await this.db.transaction(async (tx) => {
      await tx
        .update(tenants)
        .set({
          billingMode: input.billingMode,
          planId,
          accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
          limitOverrides,
          bypassReason: isBypass(input.billingMode) ? input.reason : null,
          grantedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'tenant.billing.update',
        tenantId,
        reason: input.reason,
        before: {
          billingMode: before.billingMode,
          planCode: before.planCode,
          accessExpiresAt: before.accessExpiresAt,
          limitOverrides: before.limitOverrides,
          accessState: before.access.accessState,
        },
        after: { billingMode: input.billingMode, planCode, accessExpiresAt, limitOverrides },
      });
    });
    return this.getTenant(tenantId);
  }

  async addGrant(
    actor: PlatformUser,
    tenantId: string,
    input: CreateGrantInput,
  ): Promise<TenantWithAccess> {
    await this.getTenant(tenantId);
    await this.db.transaction(async (tx) => {
      await tx.insert(entitlementGrants).values({
        tenantId,
        kind: input.kind,
        key: input.key,
        value: input.kind === 'limit' ? input.value : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        reason: input.reason,
        grantedBy: actor.id,
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'tenant.grant.add',
        tenantId,
        reason: input.reason,
        after: {
          kind: input.kind,
          key: input.key,
          value: input.kind === 'limit' ? input.value : null,
          endsAt: input.endsAt ?? null,
        },
      });
    });
    return this.getTenant(tenantId);
  }

  private async planId(code: PlanCode): Promise<string> {
    const [plan] = await this.db.select({ id: plans.id }).from(plans).where(eq(plans.code, code));
    if (!plan) throw new BadRequestException(`Unknown plan ${code}`);
    return plan.id;
  }
}
