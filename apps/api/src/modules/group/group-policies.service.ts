import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { bdLeaveFloorViolations, type LeavePolicy } from '@gp/country-packs';
import { entityPolicyOverrides, leaveTypes, legalEntities, type Tx } from '@gp/db';
import {
  effectivePolicy,
  POLICY_OVERRIDE_SCHEMAS,
  policyDifferences,
  todayIn,
  type ApiError,
  type CompanyPolicyView,
  type CompanyRef,
  type GroupPoliciesView,
  type PolicyArea,
  type PolicyOverride,
  type PolicyOverrideInput,
  type PolicyValues,
  type PolicyView,
} from '@gp/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { workingTimeLaw } from '../compliance/checker.js';
import { policyValuesOf, PolicyService } from './policy.service.js';

type OverrideRow = typeof entityPolicyOverrides.$inferSelect;
const o = entityPolicyOverrides;

/** The companies a login may see, in a fixed order: by code, then name. */
export async function companiesOf(tx: Tx, user: AuthUser): Promise<CompanyRef[]> {
  const scope = await entityScopeOf(tx, user.id);
  return tx
    .select({ id: legalEntities.id, code: legalEntities.code, name: legalEntities.name })
    .from(legalEntities)
    .where(scope ? inArray(legalEntities.id, scope) : undefined)
    .orderBy(asc(legalEntities.code), asc(legalEntities.name));
}

/** What one company does with an area: its override, the values that apply and what differs. */
function companyView<A extends PolicyArea>(
  legalEntity: CompanyRef,
  group: PolicyValues[A],
  row: OverrideRow | undefined,
): CompanyPolicyView<A> {
  const override = (row?.values ?? null) as PolicyOverride<A> | null;
  return {
    legalEntity,
    override,
    effective: effectivePolicy(group, override),
    differs: policyDifferences(group, override),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/**
 * The group's policy beside each company's overrides, and setting or clearing an override.
 * An override may not take statutory leave below the Labour Act or an overtime cap above it.
 */
@Injectable()
export class GroupPoliciesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly policy: PolicyService,
    private readonly audit: TenantAuditService,
  ) {}

  list(user: AuthUser): Promise<GroupPoliciesView> {
    return this.tenantDb.run(async (tx) => {
      const companies = await companiesOf(tx, user);
      const rows = await tx.select().from(o);
      const view = <A extends PolicyArea>(
        area: A,
        group: PolicyValues[A],
        leaveType: typeof leaveTypes.$inferSelect | null = null,
      ) =>
        ({
          area,
          leaveType: leaveType && {
            id: leaveType.id,
            code: leaveType.code,
            name: leaveType.name,
            nameBn: leaveType.nameBn,
            statutoryKey: leaveType.statutoryKey,
            accrual: leaveType.accrual,
          },
          group,
          companies: companies.map((c) =>
            companyView<A>(
              c,
              group,
              rows.find(
                (r) =>
                  r.legalEntityId === c.id &&
                  r.area === area &&
                  r.subjectId === (leaveType?.id ?? null),
              ),
            ),
          ),
        }) as PolicyView;
      const types = await tx
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.isActive, true))
        .orderBy(asc(leaveTypes.code));
      return {
        companies,
        policies: [
          view('attendance', await this.policy.groupValues(tx, 'attendance')),
          view('provident_fund', await this.policy.groupValues(tx, 'provident_fund')),
          view('overtime_caps', await this.policy.groupValues(tx, 'overtime_caps')),
          ...types.map((t) => view('leave_type', policyValuesOf('leave_type', t), t)),
        ],
      };
    });
  }

  save<A extends PolicyArea>(
    user: AuthUser,
    legalEntityId: string,
    area: A,
    input: PolicyOverrideInput,
  ): Promise<CompanyPolicyView<A>> {
    return this.tenantDb.run(async (tx) => {
      const company = await this.companyOf(tx, user, legalEntityId);
      const leaveType = await this.leaveTypeOf(tx, area, input.subjectId);
      const subjectId = leaveType?.id ?? null;
      const parsed = POLICY_OVERRIDE_SCHEMAS[area].safeParse(input.values);
      if (!parsed.success) {
        throw invalid(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
      const values = parsed.data as PolicyOverride<A>;
      if (Object.keys(values).length === 0) {
        throw invalid([{ path: 'values', message: 'Override at least one value' }]);
      }
      const group = leaveType
        ? (policyValuesOf('leave_type', leaveType) as PolicyValues[A])
        : await this.policy.groupValues(tx, area);
      if (leaveType) checkLeaveFloors(leaveType, values as PolicyOverride<'leave_type'>);
      if (area === 'overtime_caps') {
        checkCaps(effectivePolicy(group as PolicyValues['overtime_caps'], values));
      }

      const [before] = await tx
        .select()
        .from(o)
        .where(this.key(legalEntityId, area, subjectId))
        .for('update');
      const [row] = before
        ? await tx
            .update(o)
            .set({ values, updatedBy: user.id, updatedAt: new Date() })
            .where(eq(o.id, before.id))
            .returning()
        : await tx
            .insert(o)
            .values({
              tenantId: currentTenantId(),
              legalEntityId,
              area,
              subjectId,
              values,
              updatedBy: user.id,
            })
            .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'group.policy.override',
        entityType: 'entity_policy_override',
        entityId: row!.id,
        before: before ? { legalEntityId, area, subjectId, values: before.values } : null,
        after: { legalEntityId, area, subjectId, values },
      });
      return companyView<A>(company, group, row);
    });
  }

  /** Back to the group's policy: the company's override of the area goes. */
  remove(
    user: AuthUser,
    legalEntityId: string,
    area: PolicyArea,
    subjectId: string | undefined,
  ): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await this.companyOf(tx, user, legalEntityId);
      const [removed] = await tx
        .delete(o)
        .where(this.key(legalEntityId, area, subjectId ?? null))
        .returning();
      if (!removed) throw new NotFoundException('This company follows the group’s policy already');
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'group.policy.reset',
        entityType: 'entity_policy_override',
        entityId: removed.id,
        before: { legalEntityId, area, subjectId: removed.subjectId, values: removed.values },
      });
    });
  }

  /** A company the login may see; others are not found, so a scope reveals nothing. */
  private async companyOf(tx: Tx, user: AuthUser, legalEntityId: string): Promise<CompanyRef> {
    const company = (await companiesOf(tx, user)).find((c) => c.id === legalEntityId);
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /** A leave type's override names the leave type; the other areas have no subject. */
  private async leaveTypeOf(tx: Tx, area: PolicyArea, subjectId: string | undefined) {
    if ((area === 'leave_type') !== (subjectId !== undefined)) {
      throw badRequest(
        'policy_subject_invalid',
        area === 'leave_type' ? 'Choose the leave type to override' : 'Only leave has a subject',
      );
    }
    if (!subjectId) return null;
    const [type] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, subjectId));
    if (!type) throw new NotFoundException('Leave type not found');
    return type;
  }

  private key(legalEntityId: string, area: PolicyArea, subjectId: string | null) {
    return and(
      eq(o.legalEntityId, legalEntityId),
      eq(o.area, area),
      subjectId ? eq(o.subjectId, subjectId) : isNull(o.subjectId),
    );
  }
}

/** Statutory leave stays a floor for a company as for the group (Labour Act s.115–117, s.46). */
function checkLeaveFloors(
  type: typeof leaveTypes.$inferSelect,
  values: PolicyOverride<'leave_type'>,
) {
  const merged = effectivePolicy(type, values);
  const violations = bdLeaveFloorViolations(merged as unknown as LeavePolicy, todayIn());
  if (violations.length === 0) return;
  throw new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Below the statutory minimum',
    code: 'below_statutory_minimum',
    issues: violations.map((v) => ({
      path: v.field,
      message: `${v.message} (${v.reference.act}, s.${v.reference.section})`,
      code: v.rule,
      params: { limit: v.limit, section: v.reference.section },
    })),
  } satisfies ApiError);
}

/** The same refusal as a body that fails its schema, for values checked by their area's. */
const invalid = (issues: { path: string; message: string }[]) =>
  new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    code: 'validation_failed',
    issues,
  } satisfies ApiError);

/** A company's overtime caps sit at or below the law's, as the group's do (s.100, s.102). */
function checkCaps(caps: PolicyValues['overtime_caps']) {
  const law = workingTimeLaw(todayIn());
  for (const [cap, limit] of [
    [caps.overtimeDailyCapMinutes, law.overtimeDaily],
    [caps.overtimeWeeklyCapMinutes, law.overtimeWeekly],
  ] as const) {
    if (cap > limit.minutes) {
      throw badRequest(
        'cap_above_law',
        `An overtime cap can be at most ${limit.minutes / 60} hours, the law's limit (s.${limit.reference.section})`,
      );
    }
  }
}
