import { Injectable } from '@nestjs/common';
import { employees, leaveLedger, leaveRequests, leaveTypes, tenants, type Tx } from '@gp/db';
import { BD_RULES, bdEarnedLeaveRate, ruleOn } from '@gp/country-packs';
import { addDays, todayIn, type LeaveBalanceView } from '@gp/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';
import { WorkCalendarService, type WorkCalendar } from '../calendar/work-calendar.service.js';
import { PolicyService } from '../group/policy.service.js';

type Employee = Pick<typeof employees.$inferSelect, 'id' | 'joinedOn' | 'separatedOn'>;
export type LeaveTypeRow = typeof leaveTypes.$inferSelect;

const halfDayFloor = (n: number) => Math.floor(n * 2) / 2;
const daysInclusive = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/**
 * Leave balances, computed rather than stored:
 *   entitlement (from policy and statute) + carry-forward + ledger movements − pending.
 * Changing a policy or a rule therefore changes balances consistently, and the ledger keeps
 * only real events (leave taken, reversals, HR adjustments, recalculations).
 */
@Injectable()
export class BalancesService {
  constructor(
    private readonly calendars: WorkCalendarService,
    private readonly policy: PolicyService,
  ) {}

  async forEmployee(
    tx: Tx,
    employee: Employee,
    year: number,
    types?: LeaveTypeRow[],
  ): Promise<LeaveBalanceView[]> {
    const all = types ?? (await tx.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)));
    const calendar = await this.calendars.forEmployee(tx, employee.id, todayIn());
    const balances = [];
    for (const type of all) balances.push(await this.balance(tx, employee, type, year, calendar));
    return balances;
  }

  async balance(
    tx: Tx,
    employee: Employee,
    groupType: LeaveTypeRow,
    year: number,
    calendar?: WorkCalendar,
  ): Promise<LeaveBalanceView> {
    const cal = calendar ?? (await this.calendars.forEmployee(tx, employee.id, todayIn()));
    // Days a year and carry-forward as the employee's company gives this leave.
    const type = await this.policy.leaveTypeFor(tx, employee.id, groupType, todayIn());
    const eligibleFrom =
      type.minServiceDays > 0 ? addDays(employee.joinedOn, type.minServiceDays) : null;
    const leaveType = {
      id: type.id,
      code: type.code,
      name: type.name,
      nameBn: type.nameBn,
      accrual: type.accrual,
      paid: type.paid,
    };
    const moves = await this.ledgerSums(tx, employee.id, type.id, year);
    const pending = await this.pendingDays(tx, employee.id, type.id, year);

    if (type.accrual === 'per_event') {
      return {
        leaveType,
        year,
        entitlement: null,
        carriedForward: 0,
        adjustments: moves.adjustments,
        taken: moves.taken,
        pending,
        available: null,
        eligibleFrom: eligibleFrom && eligibleFrom > todayIn() ? eligibleFrom : null,
      };
    }

    const entitlement = await this.entitlement(tx, employee, type, year, cal);
    const carriedForward = await this.carriedInto(tx, employee, type, year, cal);
    const available = entitlement + carriedForward + moves.adjustments - moves.taken - pending;
    return {
      leaveType,
      year,
      entitlement,
      carriedForward,
      adjustments: moves.adjustments,
      taken: moves.taken,
      pending,
      available,
      eligibleFrom: eligibleFrom && eligibleFrom > todayIn() ? eligibleFrom : null,
    };
  }

  /** The year's allowance: pro-rated in the joining year, or earned from last year's work. */
  private async entitlement(
    tx: Tx,
    employee: Employee,
    type: LeaveTypeRow,
    year: number,
    calendar: WorkCalendar,
  ): Promise<number> {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    if (type.accrual === 'annual_grant') {
      if (employee.joinedOn > yearEnd) return 0;
      const statute =
        type.statutoryKey === 'casual'
          ? ruleOn(BD_RULES, 'leave.casual.days_per_year', yearStart).value
          : type.statutoryKey === 'sick'
            ? ruleOn(BD_RULES, 'leave.sick.days_per_year', yearStart).value
            : 0;
      const full = Math.max(type.daysPerYear ?? 0, statute);
      const from = employee.joinedOn > yearStart ? employee.joinedOn : yearStart;
      const to =
        employee.separatedOn && employee.separatedOn < yearEnd ? employee.separatedOn : yearEnd;
      return halfDayFloor((full * daysInclusive(from, to)) / daysInclusive(yearStart, yearEnd));
    }
    // earned: last year's days worked divided by the rate in force at the end of last year.
    const lastYearStart = `${year - 1}-01-01`;
    const lastYearEnd = `${year - 1}-12-31`;
    if (employee.joinedOn > lastYearEnd) return 0;
    const from = employee.joinedOn > lastYearStart ? employee.joinedOn : lastYearStart;
    const worked = await this.calendars.daysWorked(tx, employee.id, calendar, from, lastYearEnd);
    const rate = bdEarnedLeaveRate(type.workedDaysPerLeaveDay, calendar.establishment, lastYearEnd);
    return Math.floor(worked / rate);
  }

  /**
   * Unused leave from last year, up to the type's cap (zero for casual and sick leave).
   * Only years since the workspace went live count: leave taken before that was never recorded
   * here, so earlier balances arrive as HR "opening balance" entries instead.
   */
  private async carriedInto(
    tx: Tx,
    employee: Employee,
    type: LeaveTypeRow,
    year: number,
    calendar: WorkCalendar,
  ): Promise<number> {
    const cap = type.carryForwardMax;
    const firstYear = Math.max(Number(employee.joinedOn.slice(0, 4)), await this.goLiveYear(tx));
    if (cap <= 0 || year - 1 < firstYear) return 0;
    const previous = year - 1;
    const moves = await this.ledgerSums(tx, employee.id, type.id, previous);
    const closing =
      (await this.entitlement(tx, employee, type, previous, calendar)) +
      (await this.carriedInto(tx, employee, type, previous, calendar)) +
      moves.adjustments -
      moves.taken;
    return Math.max(0, Math.min(cap, closing));
  }

  /** The year the workspace started using the platform. */
  private goLiveYear(tx: Tx): Promise<number> {
    return tx
      .select({ createdAt: tenants.createdAt })
      .from(tenants)
      .where(eq(tenants.id, currentTenantId()))
      .then(([t]) => t!.createdAt.getUTCFullYear());
  }

  private async ledgerSums(tx: Tx, employeeId: string, leaveTypeId: string, year: number) {
    const rows = await tx
      .select({ kind: leaveLedger.kind, days: sql<string>`sum(${leaveLedger.days})` })
      .from(leaveLedger)
      .where(
        and(
          eq(leaveLedger.employeeId, employeeId),
          eq(leaveLedger.leaveTypeId, leaveTypeId),
          eq(leaveLedger.leaveYear, year),
        ),
      )
      .groupBy(leaveLedger.kind);
    const sum = (kinds: string[]) =>
      rows.filter((r) => kinds.includes(r.kind)).reduce((s, r) => s + Number(r.days), 0);
    return {
      // Stored negative; shown as a positive number of days taken.
      taken: -sum(['taken', 'reversal']),
      adjustments: sum(['adjustment', 'opening', 'recalculation']),
    };
  }

  private async pendingDays(tx: Tx, employeeId: string, leaveTypeId: string, year: number) {
    const [row] = await tx
      .select({ days: sql<string | null>`sum(${leaveRequests.days})` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.leaveTypeId, leaveTypeId),
          inArray(leaveRequests.status, ['pending']),
          sql`extract(year from ${leaveRequests.startDate}) = ${year}`,
        ),
      );
    return Number(row?.days ?? 0);
  }
}
