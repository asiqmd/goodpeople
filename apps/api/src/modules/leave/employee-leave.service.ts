import { Injectable, NotFoundException } from '@nestjs/common';
import { employees, leaveLedger, leaveRequests, leaveTypes } from '@gp/db';
import type {
  LeaveAdjustmentInput,
  LeaveBalanceView,
  LeaveLedgerEntryView,
  LeaveRequestView,
} from '@gp/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { BalancesService } from './balances.service.js';
import { employeeOfUser } from './leave-requests.service.js';
import { loadRequests } from './leave-views.js';

export interface EmployeeLeaveSummary {
  year: number;
  balances: LeaveBalanceView[];
  requests: LeaveRequestView[];
  ledger: LeaveLedgerEntryView[];
}

/** One employee's leave for a year: balances, requests and balance movements. */
@Injectable()
export class EmployeeLeaveService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly balances: BalancesService,
    private readonly audit: TenantAuditService,
  ) {}

  async myBalances(user: AuthUser, year: number): Promise<LeaveBalanceView[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return this.balances.forEmployee(tx, me, year);
    });
  }

  summary(employeeId: string, year: number): Promise<EmployeeLeaveSummary> {
    return this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      const ledger = await tx
        .select({ entry: leaveLedger, code: leaveTypes.code })
        .from(leaveLedger)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveLedger.leaveTypeId))
        .where(and(eq(leaveLedger.employeeId, employeeId), eq(leaveLedger.leaveYear, year)))
        .orderBy(desc(leaveLedger.createdAt));
      return {
        year,
        balances: await this.balances.forEmployee(tx, employee, year),
        requests: await loadRequests(
          tx,
          and(
            eq(leaveRequests.employeeId, employeeId),
            sql`extract(year from ${leaveRequests.startDate}) = ${year}`,
          ),
        ),
        ledger: ledger.map(({ entry, code }) => ({
          id: entry.id,
          leaveType: { id: entry.leaveTypeId, code },
          year: entry.leaveYear,
          kind: entry.kind,
          days: entry.days,
          note: entry.note,
          createdAt: entry.createdAt.toISOString(),
        })),
      };
    });
  }

  /** An opening balance (e.g. when moving from spreadsheets) or a correction, with a note. */
  async adjust(
    actor: AuthUser,
    employeeId: string,
    input: LeaveAdjustmentInput,
  ): Promise<EmployeeLeaveSummary> {
    await this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      const [entry] = await tx
        .insert(leaveLedger)
        .values({
          tenantId: currentTenantId(),
          employeeId,
          leaveTypeId: input.leaveTypeId,
          leaveYear: input.year,
          kind: input.kind,
          days: input.days,
          note: input.note,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: `leave.${input.kind}`,
        entityType: 'employee',
        entityId: employeeId,
        after: { ...input, ledgerEntryId: entry!.id },
      });
    });
    return this.summary(employeeId, input.year);
  }
}
