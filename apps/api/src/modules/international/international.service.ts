import { INTERNATIONAL_CHECKOUT_ENABLED } from '@gp/shared';
import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  companyLegalProfiles,
  employmentStatutoryProfiles,
  employeeIdentifiers,
  employeePaymentAccounts,
  employees,
  payrollRuns,
  legalEntities,
  jobAssignments,
  tenantAuditLog,
  type FieldCipher,
} from '@gp/db';
import {
  internationalBankInputSchema,
  todayIn,
  statutoryProfileInputSchema,
  identifierInputSchema,
  type LegalProfileInput,
  addDays,
  localParts,
  type InternationalOverview,
} from '@gp/shared';
import { and, eq, inArray, sql, desc, isNull, lte } from 'drizzle-orm';
import type { z } from 'zod';
import { TenantDb, FIELD_CIPHER } from '../../db/db.module.js';
import { currentTenantId } from '../../common/request-context.js';
import type { AuthUser } from '../../common/auth-user.js';
import { entityScopeOf, entityScope } from '../access-scopes/entity-scope.js';
import { fieldAllowed } from '../../common/field-access.js';
@Injectable()
export class InternationalService {
  constructor(
    private tenantDb: TenantDb,
    @Inject(FIELD_CIPHER) private cipher: FieldCipher,
  ) {}
  private async company(
    tx: Parameters<Parameters<TenantDb['run']>[0]>[0],
    actor: AuthUser,
    id: string,
  ) {
    const scope = await entityScopeOf(tx, actor.id);
    if (scope && !scope.includes(id)) throw new NotFoundException('Company not found');
    const [row] = await tx.select().from(legalEntities).where(eq(legalEntities.id, id));
    if (!row) throw new NotFoundException('Company not found');
    return row;
  }
  async assertUnrestricted(actor: AuthUser) {
    return this.tenantDb.run(async (tx) => {
      if (actor.kind !== 'tenant' || actor.policy?.custom || (await entityScopeOf(tx, actor.id)))
        throw new ForbiddenException('New employers require an unrestricted local administrator');
    });
  }
  async addBank(actor: AuthUser, input: z.infer<typeof internationalBankInputSchema>) {
    if (!fieldAllowed(actor, 'bank', 'write'))
      throw new ForbiddenException('Bank field grant required');
    return this.tenantDb.run(async (tx) => {
      await this.employee(tx, actor, input.employeeId);
      const company = await this.company(tx, actor, input.legalEntityId);
      const [job] = await tx
        .select()
        .from(jobAssignments)
        .where(
          and(
            eq(jobAssignments.employeeId, input.employeeId),
            lte(jobAssignments.effectiveFrom, todayIn()),
          ),
        )
        .orderBy(desc(jobAssignments.effectiveFrom))
        .limit(1);
      if (
        !job ||
        job.legalEntityId !== company.id ||
        company.countryCode !== input.destination.country
      )
        throw new ConflictException(
          'Bank destination must match the current legal employer and currency',
        );
      const value = (input.destination.iban ?? input.destination.accountNumber!)
        .replaceAll(' ', '')
        .toUpperCase();
      const [row] = await tx
        .insert(employeePaymentAccounts)
        .values({
          tenantId: currentTenantId(),
          employeeId: input.employeeId,
          method: 'bank',
          provider: input.provider,
          accountName: input.accountName,
          countryCode: input.destination.country,
          currency: input.destination.currency,
          accountNumberEnc: this.cipher.encrypt(value, {
            tenantId: currentTenantId(),
            field: 'employee_payment_accounts.account_number',
          }),
          accountNumberLast4: value.slice(-4),
        })
        .returning({
          id: employeePaymentAccounts.id,
          country: employeePaymentAccounts.countryCode,
          currency: employeePaymentAccounts.currency,
          accountNumberLast4: employeePaymentAccounts.accountNumberLast4,
        });
      await tx.insert(tenantAuditLog).values({
        tenantId: currentTenantId(),
        actorUserId: actor.id,
        action: 'international.bank.create',
        entityType: 'employee',
        entityId: input.employeeId,
        after: { country: input.destination.country, currency: input.destination.currency },
      });
      return row;
    });
  }
  async overview(actor: AuthUser): Promise<InternationalOverview> {
    return this.tenantDb.run(async (tx) => {
      const scope = await entityScopeOf(tx, actor.id),
        profiles = await tx
          .select()
          .from(companyLegalProfiles)
          .where(scope ? inArray(companyLegalProfiles.legalEntityId, scope) : undefined);
      const [legacy] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(payrollRuns)
        .where(and(eq(payrollRuns.status, 'locked'), sql`${payrollRuns.statutoryContext} is null`));
      const companies = await tx
        .select({ id: legalEntities.id, name: legalEntities.name })
        .from(legalEntities);
      return {
        profiles: profiles.map((p) => ({
          ...p,
          companyName: companies.find((c) => c.id === p.legalEntityId)?.name ?? '',
        })),
        commercialGate: {
          enabled: INTERNATIONAL_CHECKOUT_ENABLED,
          reason:
            'Merchant selection, USD/AED capability, sandbox evidence and finance/tax review remain open',
        },
        reconciliation: {
          legacyBdCompanies: profiles.filter((p) => p.countryCode === 'BD').length,
          legacyLockedRuns: scope ? 0 : legacy!.n,
        },
      };
    });
  }
  async addProfile(actor: AuthUser, input: LegalProfileInput) {
    return this.tenantDb.run(async (tx) => {
      await this.company(tx, actor, input.legalEntityId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.legalEntityId},54))`,
      );
      const locked = await tx
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.status, 'locked'),
            sql`${payrollRuns.periodEnd}>=${input.effectiveFrom}`,
          ),
        )
        .limit(1);
      if (locked.length)
        throw new ConflictException('A profile cannot rewrite a locked historical period');
      await tx
        .update(companyLegalProfiles)
        .set({ effectiveTo: addDays(input.effectiveFrom, -1) })
        .where(
          and(
            eq(companyLegalProfiles.legalEntityId, input.legalEntityId),
            sql`${companyLegalProfiles.effectiveTo} is null`,
          ),
        );
      const { reason, ...data } = input;
      const [row] = await tx
        .insert(companyLegalProfiles)
        .values({
          ...data,
          tenantId: currentTenantId(),
          reviewStatus: input.countryCode === 'BD' ? 'existing_bd' : 'needs_review',
          reason,
          createdBy: actor.id,
        })
        .returning();
      await tx.insert(tenantAuditLog).values({
        tenantId: currentTenantId(),
        actorUserId: actor.id,
        action: 'international.profile.create',
        entityType: 'company_legal_profile',
        entityId: row!.id,
        after: {
          country: input.countryCode,
          currency: input.currency,
          effectiveFrom: input.effectiveFrom,
          reason,
        },
      });
      return row;
    });
  }
  private async employee(
    tx: Parameters<Parameters<TenantDb['run']>[0]>[0],
    actor: AuthUser,
    id: string,
  ) {
    const scope = await entityScope(tx, actor, employees.id);
    const [row] = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), scope));
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }
  async addEmployment(actor: AuthUser, input: z.infer<typeof statutoryProfileInputSchema>) {
    if (!fieldAllowed(actor, 'identity', 'write'))
      throw new ForbiddenException('Identity field grant required');
    return this.tenantDb.run(async (tx) => {
      await this.employee(tx, actor, input.employeeId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.employeeId},54))`);
      const existing = await tx
        .select()
        .from(employmentStatutoryProfiles)
        .where(eq(employmentStatutoryProfiles.employeeId, input.employeeId));
      if (existing.some((p) => p.effectiveFrom >= input.effectiveFrom))
        throw new ConflictException('Employment profiles must be appended in date order');
      await tx
        .update(employmentStatutoryProfiles)
        .set({ effectiveTo: addDays(input.effectiveFrom, -1) })
        .where(
          and(
            eq(employmentStatutoryProfiles.employeeId, input.employeeId),
            isNull(employmentStatutoryProfiles.effectiveTo),
          ),
        );
      const [row] = await tx
        .insert(employmentStatutoryProfiles)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await tx.insert(tenantAuditLog).values({
        tenantId: currentTenantId(),
        actorUserId: actor.id,
        action: 'international.employment_profile.create',
        entityType: 'employee',
        entityId: input.employeeId,
        after: { effectiveFrom: input.effectiveFrom, reason: input.reason },
      });
      return row;
    });
  }
  async addIdentifier(actor: AuthUser, input: z.infer<typeof identifierInputSchema>) {
    if (!fieldAllowed(actor, 'identity', 'write'))
      throw new ForbiddenException('Identity field grant required');
    return this.tenantDb.run(async (tx) => {
      await this.employee(tx, actor, input.employeeId);
      const { value, ...data } = input;
      const [row] = await tx
        .insert(employeeIdentifiers)
        .values({
          ...data,
          tenantId: currentTenantId(),
          valueEnc: this.cipher.encrypt(value, {
            tenantId: currentTenantId(),
            field: 'international.identifier',
          }),
          last4: value.slice(-4),
        })
        .returning({
          id: employeeIdentifiers.id,
          kind: employeeIdentifiers.kind,
          issuer: employeeIdentifiers.issuer,
          last4: employeeIdentifiers.last4,
        });
      await tx.insert(tenantAuditLog).values({
        tenantId: currentTenantId(),
        actorUserId: actor.id,
        action: 'international.identifier.create',
        entityType: 'employee',
        entityId: input.employeeId,
        after: { kind: input.kind, issuer: input.issuer, last4: row!.last4 },
      });
      return row;
    });
  }
  async employeeProfiles(actor: AuthUser, id: string) {
    if (!fieldAllowed(actor, 'identity', 'read'))
      throw new ForbiddenException('Identity field grant required');
    return this.tenantDb.run(async (tx) => {
      await this.employee(tx, actor, id);
      return {
        profiles: await tx
          .select()
          .from(employmentStatutoryProfiles)
          .where(eq(employmentStatutoryProfiles.employeeId, id)),
        identifiers: await tx
          .select({
            id: employeeIdentifiers.id,
            kind: employeeIdentifiers.kind,
            issuer: employeeIdentifiers.issuer,
            last4: employeeIdentifiers.last4,
            validTo: employeeIdentifiers.validTo,
          })
          .from(employeeIdentifiers)
          .where(eq(employeeIdentifiers.employeeId, id)),
      };
    });
  }
  async clock(actor: AuthUser, companyId: string, instant: string) {
    return this.tenantDb.run(async (tx) => {
      await this.company(tx, actor, companyId);
      const rows = await tx
        .select()
        .from(companyLegalProfiles)
        .where(eq(companyLegalProfiles.legalEntityId, companyId))
        .orderBy(desc(companyLegalProfiles.effectiveFrom));
      const p = rows.find(
        (candidate) =>
          candidate.effectiveFrom <=
            localParts(new Date(instant), candidate.businessTimeZone).date &&
          (!candidate.effectiveTo ||
            candidate.effectiveTo >=
              localParts(new Date(instant), candidate.businessTimeZone).date),
      );
      if (!p) throw new ConflictException('Explicit profile required on that date');
      return {
        ...localParts(new Date(instant), p.businessTimeZone),
        zone: p.businessTimeZone,
        calendar: p.calendar,
        statutoryReady: p.countryCode === 'BD' && p.calendar === 'gregorian',
        hijriConversion: 'not_qualified',
      };
    });
  }
}
