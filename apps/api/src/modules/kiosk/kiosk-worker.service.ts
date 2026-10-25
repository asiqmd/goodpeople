import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  employees,
  payrollRunItems,
  payrollRuns,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  todayIn,
  type FeatureKey,
  type KioskMeView,
  type KioskPayslip,
  type LeaveRequestInput,
  type LeaveRequestView,
  type TenantWithAccess,
} from '@gp/shared';
import { and, desc, eq, isNotNull, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { forbidden } from '../../common/errors.js';
import { AttendanceService, punchesOf } from '../attendance/attendance.service.js';
import { toDayView } from '../attendance/attendance-views.js';
import { BalancesService } from '../leave/balances.service.js';
import { LeaveRequestsService } from '../leave/leave-requests.service.js';
import { PayrollRunsService } from '../payroll/payroll-runs.service.js';
import { jobsOn } from '../payroll/run-context.js';
import type { KioskWorker } from './kiosk-auth.service.js';
import type { KioskIdentity } from './kiosks.service.js';

type EmployeeRow = typeof employees.$inferSelect;

const has = (tenant: TenantWithAccess, feature: FeatureKey) =>
  tenant.access.features.includes(feature);
const requireFeature = (tenant: TenantWithAccess, feature: FeatureKey) => {
  if (!has(tenant, feature)) {
    throw forbidden('feature_not_in_plan', `Your plan does not include ${feature}`);
  }
};

/**
 * What a signed-in worker sees and does at a kiosk, by employee rather than by login: the
 * same attendance, leave and payslip code that self-service uses.
 */
@Injectable()
export class KioskWorkerService {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly tenantDb: TenantDb,
    private readonly balances: BalancesService,
    private readonly leaveRequests: LeaveRequestsService,
    private readonly payroll: PayrollRunsService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  me(worker: KioskWorker, tenant: TenantWithAccess): Promise<KioskMeView> {
    return this.tenantDb.run(async (tx) => {
      const employee = await this.employee(tx, worker);
      let timeZone = 'Asia/Dhaka';
      let today: KioskMeView['today'] = null;
      let month: KioskMeView['month'] = null;
      if (has(tenant, 'attendance')) {
        const current = await this.attendance.currentDay(tx, employee);
        timeZone = current.timeZone;
        const day = toDayView(current.day);
        const punches = await punchesOf(tx, employee.id, current.day.opensAt, current.day.closesAt);
        today = {
          date: day.date,
          status: day.status,
          dayType: day.dayType,
          holidayName: day.holidayName,
          shift: day.shift,
          leaveCode: day.leave?.code ?? null,
          punches: punches.filter((p) => !p.voided).map((p) => p.punchedAt),
        };
        const to = todayIn(timeZone);
        const from = `${to.slice(0, 7)}-01`;
        const { totals } = await this.attendance.rangeFor(tx, employee, from, to);
        month = {
          from,
          to,
          present: totals.present,
          halfDay: totals.halfDay,
          absent: totals.absent,
          onLeave: totals.onLeave,
          missingPunch: totals.missingPunch,
          overtimeMinutes: totals.overtimeMinutes,
        };
      }
      const date = todayIn(timeZone);
      const job = (await jobsOn(tx, [employee.id], date)).get(employee.id);
      const balances = has(tenant, 'leave')
        ? await this.balances.forEmployee(tx, employee, Number(date.slice(0, 4)))
        : null;
      return {
        employee: {
          code: employee.employeeCode,
          name: employee.fullName,
          nameBn: employee.fullNameBn,
          designation: job?.designation ?? null,
          designationBn: job?.designationBn ?? null,
          line: job?.orgUnit ?? null,
          lineBn: job?.orgUnitBn ?? null,
        },
        workspace: { name: tenant.name, slug: tenant.slug },
        timeZone,
        today,
        month,
        // Maternity and other leave granted per event are applied for with HR, not here.
        leave: balances?.filter((b) => b.available !== null) ?? null,
        payslips: has(tenant, 'payroll') ? await this.payslipsOf(tx, employee.id, 3) : null,
      };
    });
  }

  /** Applies for leave with self-service's checks and approval chain. */
  async applyLeave(
    worker: KioskWorker,
    kiosk: KioskIdentity,
    tenant: TenantWithAccess,
    input: LeaveRequestInput,
  ): Promise<LeaveRequestView> {
    requireFeature(tenant, 'leave');
    const employee = await this.tenantDb.run((tx) => this.employee(tx, worker));
    return this.leaveRequests.apply(this.actingFor(employee, kiosk), employee.id, input);
  }

  /** The worker's own published payslip, as the PDF self-service gives. */
  async payslip(
    worker: KioskWorker,
    kiosk: KioskIdentity,
    tenant: TenantWithAccess,
    itemId: string,
    language: 'en' | 'bn',
  ) {
    requireFeature(tenant, 'payroll');
    const employee = await this.tenantDb.run(async (tx) => {
      const [own] = await tx
        .select({ id: payrollRunItems.id })
        .from(payrollRunItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
        .where(this.publishedOf(worker.employeeId, eq(payrollRunItems.id, itemId)));
      if (!own) throw new NotFoundException('Payslip not found');
      return this.employee(tx, worker);
    });
    return this.payroll.payslip(itemId, language, this.actingFor(employee, kiosk), false);
  }

  private async employee(tx: Tx, worker: KioskWorker): Promise<EmployeeRow> {
    const [row] = await tx.select().from(employees).where(eq(employees.id, worker.employeeId));
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  /**
   * Who acts when the kiosk does something for the worker its session proved (card and PIN):
   * the worker's own login when they have one, else the kiosk. It acts for that worker only,
   * the way HR applies on someone's behalf, which is why it may name the employee.
   */
  private actingFor(employee: EmployeeRow, kiosk: KioskIdentity): AuthUser {
    return {
      kind: 'tenant',
      id: employee.userId ?? kiosk.kioskId,
      role: 'hr_officer',
      tenantId: currentTenantId(),
    };
  }

  private publishedOf(employeeId: string, extra?: SQL) {
    return and(
      eq(payrollRunItems.employeeId, employeeId),
      eq(payrollRunItems.status, 'ok'),
      isNotNull(payrollRuns.publishedAt),
      extra,
    );
  }

  private async payslipsOf(tx: Tx, employeeId: string, limit: number): Promise<KioskPayslip[]> {
    const rows = await tx
      .select({ item: payrollRunItems, run: payrollRuns })
      .from(payrollRunItems)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
      .where(this.publishedOf(employeeId))
      .orderBy(desc(payrollRuns.periodStart), desc(payrollRuns.publishedAt))
      .limit(limit);
    return rows.map(({ item, run }) => ({
      itemId: item.id,
      kind: run.kind,
      festival: run.bonus?.festival ?? null,
      festivalBn: run.bonus?.festivalBn ?? null,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      net: (
        JSON.parse(
          this.cipher.decrypt(item.resultEnc, {
            tenantId: currentTenantId(),
            field: CIPHER_FIELDS.runResults,
          }),
        ) as { net: string }
      ).net,
    }));
  }
}
