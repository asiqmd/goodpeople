import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { companyLegalProfiles, legalEntities, type Tx } from '@gp/db';
import {
  addDays,
  addMonths,
  can,
  grantMatches,
  INSIGHT_VERSION,
  PAYROLL_INSIGHT_MONTHS,
  policyCan,
  todayIn,
  type FeatureKey,
  type InsightCatalog,
  type InsightDefinition,
  type InsightKind,
  type InsightView,
  type Permission,
  type TenantWithAccess,
} from '@gp/shared';
import { createHash } from 'node:crypto';
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { fieldAllowed } from '../../common/field-access.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { PayrollReportsService } from '../payroll/payroll-reports.service.js';
import { operatingInsight } from './operating-insights.js';

export const INSIGHT_FEATURES = ['analytics', 'analytics_insights', 'core_hr'] as const;
const SOURCES: Record<InsightKind, { feature: FeatureKey; permission: Permission }> = {
  attendance: { feature: 'attendance', permission: 'attendance.manage' },
  leave: { feature: 'leave', permission: 'leave.manage' },
  learning: { feature: 'lms', permission: 'learning.manage' },
  payroll: { feature: 'payroll', permission: 'payroll.view' },
};
const OPERATING_KINDS = ['attendance', 'leave', 'learning'] as const;
const COMPANY_LIMIT = 50;

export const insightHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

function latestMonth(now: Date, zone: string) {
  return addMonths(todayIn(zone, now).slice(0, 7) + '-01', -1).slice(0, 7);
}

export function assertInsightActor(
  user: AuthUser,
): asserts user is Extract<AuthUser, { kind: 'tenant' }> {
  if (
    user.kind !== 'tenant' ||
    user.role === 'support' ||
    user.selfService ||
    !user.sessionId ||
    user.revision === undefined
  )
    throw forbidden('insight_actor', 'Insight requires an authorized workspace session');
}

function companyRight(user: AuthUser, permission: Permission, companyId: string, global: boolean) {
  if (user.kind !== 'tenant') return false;
  if (!user.policy?.custom) return can(user.role, permission);
  return (
    policyCan(user.policy, permission, companyId) &&
    user.policy.grants.some(
      (g) =>
        grantMatches(g, companyId) &&
        g.relationship === 'all' &&
        (!global || g.scope === 'all') &&
        g.permissions.includes(permission),
    )
  );
}

@Injectable()
export class InsightsService {
  constructor(
    private readonly db: TenantDb,
    private readonly payroll: PayrollReportsService,
  ) {}

  async authority(tx: Tx, user: AuthUser, tenant: TenantWithAccess) {
    assertInsightActor(user);
    if (
      user.tenantId !== tenant.id ||
      tenant.access.accessState === 'suspended' ||
      INSIGHT_FEATURES.some((feature) => !tenant.access.features.includes(feature))
    )
      throw forbidden('insight_feature', 'Insight is unavailable for this workspace');
    const companies = await tx
      .select({
        id: legalEntities.id,
        name: legalEntities.name,
        country: legalEntities.countryCode,
      })
      .from(legalEntities)
      .orderBy(asc(legalEntities.id))
      .limit(COMPANY_LIMIT + 1);
    if (companies.length > COMPANY_LIMIT)
      throw badRequest('insight_limit', 'This workspace exceeds the supported company count');
    const legacy = user.policy?.custom ? null : await entityScopeOf(tx, user.id);
    const permits = (kind: InsightKind, company: string, global = false) =>
      tenant.access.features.includes(SOURCES[kind].feature) &&
      (legacy === null || (!global && legacy.includes(company))) &&
      (['analytics.view', 'employees.read', SOURCES[kind].permission] as const).every(
        (permission) => companyRight(user, permission, company, global),
      );
    const global = (permissions: readonly Permission[]) =>
      companies.length > 0 &&
      legacy === null &&
      companies.every((c) => permissions.every((p) => companyRight(user, p, c.id, true)));
    return {
      workforceGlobal: global(['analytics.view', 'employees.read']),
      canReview: (companyId?: string) =>
        companyId
          ? (legacy === null || legacy.includes(companyId)) &&
            companyRight(user, 'anomalies.review', companyId, false)
          : global(['anomalies.review']),
      bdAttendanceCompanies: companies
        .filter((c) => c.country === 'BD' && permits('attendance', c.id))
        .map(({ id, name }) => ({ id, name })),
      companies: companies
        .map(({ id, name }) => ({
          id,
          name,
          kinds: OPERATING_KINDS.filter((kind) => permits(kind, id)),
        }))
        .filter((company) => company.kinds.length),
      payroll:
        companies.length > 0 &&
        !!user.mfaAt &&
        fieldAllowed(user, 'pay', 'read') &&
        companies.every((c) => permits('payroll', c.id, true)),
      allCompanyIds: companies.map((c) => c.id),
      legacyBd: companies.length > 0 && companies.every((c) => c.country === 'BD'),
    };
  }

  catalog(user: AuthUser, tenant: TenantWithAccess): Promise<InsightCatalog> {
    return this.db.run(async (tx) => {
      const access = await this.authority(tx, user, tenant);
      return {
        latestMonth: latestMonth(new Date(), 'Asia/Dhaka'),
        companies: access.companies,
        payroll: access.payroll,
        payrollExport: access.payroll && fieldAllowed(user, 'pay', 'export'),
        canSave: tenant.access.accessState === 'full',
      };
    }, true);
  }

  authorize(
    access: Awaited<ReturnType<InsightsService['authority']>>,
    user: AuthUser,
    definition: InsightDefinition,
    exporting = false,
  ) {
    if (definition.kind === 'payroll') {
      if (!access.payroll || (exporting && !fieldAllowed(user, 'pay', 'export')))
        throw forbidden(
          'insight_pay_scope',
          'Payroll insight requires MFA, all-company source access and pay field permission',
        );
      return insightHash(access.allCompanyIds);
    }
    if (
      !access.companies.some(
        (c) => c.id === definition.companyId && c.kinds.includes(definition.kind),
      )
    )
      throw new NotFoundException('Insight scope not found');
    return insightHash([definition.companyId]);
  }

  async measure(tx: Tx, user: AuthUser, tenant: TenantWithAccess, definition: InsightDefinition) {
    const access = await this.authority(tx, user, tenant);
    this.authorize(access, user, definition);
    return this.measureAuthorized(tx, definition, access.legacyBd);
  }

  view(user: AuthUser, tenant: TenantWithAccess, definition: InsightDefinition) {
    return this.db.run((tx) => this.measure(tx, user, tenant, definition), true);
  }

  async window(tx: Tx, definition: InsightDefinition, now = new Date()) {
    const from = definition.month + '-01';
    const through = addDays(addMonths(from, 1), -1);
    const context =
      definition.kind === 'payroll'
        ? { country: 'BD', timeZone: 'Asia/Dhaka' }
        : await this.companyContext(tx, definition.companyId, from, through);
    if (definition.month > latestMonth(now, context?.timeZone ?? 'Asia/Dhaka'))
      throw badRequest('insight_month', 'Choose a completed business month');
    return { from, through, context };
  }

  async measureAuthorized(
    tx: Tx,
    definition: InsightDefinition,
    legacyBd: boolean,
  ): Promise<InsightView> {
    const now = new Date();
    const { from, through, context } = await this.window(tx, definition, now);
    const points: InsightView['points'] =
      definition.kind === 'payroll'
        ? await this.payroll.insightCost(tx, definition.month, PAYROLL_INSIGHT_MONTHS, legacyBd)
        : [
            context
              ? await operatingInsight(tx, definition, { from, through, ...context })
              : {
                  month: definition.month,
                  country: null,
                  currency: null,
                  state: 'unavailable',
                  issue: 'context',
                  values: {},
                },
          ];
    const result = {
      definition,
      version: INSIGHT_VERSION,
      timeZone: context?.timeZone ?? null,
      points,
    };
    return { ...result, dataAsOf: now.toISOString(), sourceRevision: insightHash(result) };
  }

  private async companyContext(tx: Tx, companyId: string, from: string, through: string) {
    const [company] = await tx
      .select({ country: legalEntities.countryCode })
      .from(legalEntities)
      .where(eq(legalEntities.id, companyId));
    const profiles = await tx
      .select({
        from: companyLegalProfiles.effectiveFrom,
        through: companyLegalProfiles.effectiveTo,
        timeZone: companyLegalProfiles.businessTimeZone,
        calendar: companyLegalProfiles.calendar,
        country: companyLegalProfiles.countryCode,
      })
      .from(companyLegalProfiles)
      .where(
        and(
          eq(companyLegalProfiles.legalEntityId, companyId),
          lte(companyLegalProfiles.effectiveFrom, through),
          or(isNull(companyLegalProfiles.effectiveTo), gte(companyLegalProfiles.effectiveTo, from)),
        ),
      )
      .limit(2);
    if (!profiles.length && company?.country === 'BD') {
      const [history] = await tx
        .select({ id: companyLegalProfiles.id })
        .from(companyLegalProfiles)
        .where(eq(companyLegalProfiles.legalEntityId, companyId))
        .limit(1);
      if (!history) return { country: 'BD', timeZone: 'Asia/Dhaka' };
    }
    const profile = profiles[0];
    if (
      !profile ||
      profiles.length !== 1 ||
      profile.calendar !== 'gregorian' ||
      profile.from > from ||
      (profile.through && profile.through < through)
    )
      return null;
    try {
      todayIn(profile.timeZone);
      return { country: profile.country, timeZone: profile.timeZone };
    } catch {
      return null;
    }
  }
}

export function isInsightDenied(error: unknown) {
  return error instanceof ForbiddenException || error instanceof NotFoundException;
}
