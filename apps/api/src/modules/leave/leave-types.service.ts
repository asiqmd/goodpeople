import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { leaveTypes, provisionCountryDefaults } from '@gp/db';
import { bdLeaveFloorViolations, type LeavePolicy } from '@gp/country-packs';
import {
  todayIn,
  type ApiError,
  type LeaveTypeInput,
  type LeaveTypeUpdate,
  type LeaveTypeView,
} from '@gp/shared';
import { asc, eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import type { LeaveTypeRow } from './balances.service.js';

export const toLeaveTypeView = (t: LeaveTypeRow): LeaveTypeView => ({
  id: t.id,
  code: t.code,
  name: t.name,
  nameBn: t.nameBn,
  statutoryKey: t.statutoryKey,
  paid: t.paid,
  accrual: t.accrual,
  daysPerYear: t.daysPerYear,
  workedDaysPerLeaveDay: t.workedDaysPerLeaveDay,
  maxDaysPerRequest: t.maxDaysPerRequest,
  carryForwardMax: t.carryForwardMax,
  minServiceDays: t.minServiceDays,
  gender: t.gender,
  countsOffDays: t.countsOffDays,
  allowHalfDay: t.allowHalfDay,
  approvalChain: t.approvalChain,
  requiresDocumentAfterDays: t.requiresDocumentAfterDays,
  isActive: t.isActive,
});

/** Leave types. Statutory ones come from the country pack and cannot go below the law. */
@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  list(includeInactive: boolean): Promise<LeaveTypeView[]> {
    return this.tenantDb.run(async (tx) =>
      (
        await tx
          .select()
          .from(leaveTypes)
          .where(includeInactive ? undefined : eq(leaveTypes.isActive, true))
          .orderBy(asc(leaveTypes.code))
      ).map(toLeaveTypeView),
    );
  }

  /** Adds any missing statutory types and the default holiday calendar. Safe to repeat. */
  async provisionDefaults(actor: AuthUser): Promise<LeaveTypeView[]> {
    await this.tenantDb.run(async (tx) => {
      await provisionCountryDefaults(tx, currentTenantId(), {
        countryPack: 'BD',
        today: todayIn(),
      });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'leave.defaults.provision',
        entityType: 'leave_type',
        entityId: null,
      });
    });
    return this.list(true);
  }

  create(actor: AuthUser, input: LeaveTypeInput): Promise<LeaveTypeView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(leaveTypes)
        .values({ ...input, tenantId: currentTenantId(), statutoryKey: null })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'leave.type.create',
        entityType: 'leave_type',
        entityId: row!.id,
        after: input,
      });
      return toLeaveTypeView(row!);
    });
  }

  update(actor: AuthUser, id: string, input: LeaveTypeUpdate): Promise<LeaveTypeView> {
    return this.tenantDb.run(async (tx) => {
      const [current] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, id));
      if (!current) throw new NotFoundException('Leave type not found');
      const merged = { ...current, ...input } as LeaveTypeRow;
      const violations = bdLeaveFloorViolations(merged as unknown as LeavePolicy, todayIn());
      if (violations.length) {
        const body: ApiError = {
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
        };
        throw new BadRequestException(body);
      }
      const [row] = await tx.update(leaveTypes).set(input).where(eq(leaveTypes.id, id)).returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'leave.type.update',
        entityType: 'leave_type',
        entityId: id,
        before: toLeaveTypeView(current),
        after: input,
      });
      return toLeaveTypeView(row!);
    });
  }
}
