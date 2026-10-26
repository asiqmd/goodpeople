import { Injectable } from '@nestjs/common';
import { employeeAllocations, projects, timesheetEntries, timesheets, type Tx } from '@gp/db';
import {
  groupBy,
  monthBounds,
  type AllocationBasis,
  type Decimal,
  type ProjectCostKind,
} from '@gp/shared';
import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { monthsFrom, sharesOf, type TimesheetHours } from './shares.js';

export interface ProjectShare {
  projectId: string;
  code: string;
  name: string;
  costKind: ProjectCostKind;
  fraction: Decimal;
  /** Hours on the project, when the share comes from a timesheet. */
  hours: Decimal | null;
}

/** A person's split of a month's salary; what the shares leave stays with their own unit. */
export interface EmployeeShares {
  basis: AllocationBasis;
  /** The approved timesheet the split comes from. */
  timesheetId: string | null;
  shares: ProjectShare[];
}

/**
 * Each person's share of salary by project for a month: from their approved timesheet when
 * there is one, else from their planned allocations. Payroll's journal and cost summary and
 * the project reports read it.
 */
@Injectable()
export class ProjectSharesService {
  constructor(private readonly entitlements: EntitlementsService) {}

  /** Whether the workspace's plan has projects; without them salaries are not split. */
  async inPlan(): Promise<boolean> {
    const tenant = await this.entitlements.forTenant(currentTenantId());
    return !!tenant?.access.features.includes('projects');
  }

  /** Shares for a month (YYYY-MM) of everyone asked for. */
  async sharesFor(
    tx: Tx,
    employeeIds: string[],
    month: string,
  ): Promise<Map<string, EmployeeShares>> {
    return (await this.sharesByMonth(tx, employeeIds, month, month)).get(month)!;
  }

  /** Shares for each month of a period, read in one go. */
  async sharesByMonth(
    tx: Tx,
    employeeIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, Map<string, EmployeeShares>>> {
    const months = monthsFrom(from, to);
    const out = new Map(months.map((m) => [m, new Map<string, EmployeeShares>()]));
    const ids = [...new Set(employeeIds)];
    if (ids.length === 0) return out;
    const start = `${from}-01`;
    const end = monthBounds(to).end;
    const planned = await tx
      .select({
        employeeId: employeeAllocations.employeeId,
        projectId: employeeAllocations.projectId,
        percent: employeeAllocations.percent,
        costKind: employeeAllocations.costKind,
        fromOn: employeeAllocations.fromOn,
        toOn: employeeAllocations.toOn,
      })
      .from(employeeAllocations)
      .where(
        and(
          inArray(employeeAllocations.employeeId, ids),
          lte(employeeAllocations.fromOn, end),
          or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, start)),
        ),
      );
    const approved = await tx
      .select({ id: timesheets.id, employeeId: timesheets.employeeId, month: timesheets.month })
      .from(timesheets)
      .where(
        and(
          inArray(timesheets.employeeId, ids),
          eq(timesheets.status, 'approved'),
          gte(timesheets.month, start),
          lte(timesheets.month, end),
        ),
      );
    const hours = approved.length
      ? await tx
          .select({
            timesheetId: timesheetEntries.timesheetId,
            projectId: timesheetEntries.projectId,
            hours: sql<string>`sum(${timesheetEntries.hours})::text`,
          })
          .from(timesheetEntries)
          .where(
            inArray(
              timesheetEntries.timesheetId,
              approved.map((t) => t.id),
            ),
          )
          .groupBy(timesheetEntries.timesheetId, timesheetEntries.projectId)
      : [];
    const projectIds = [
      ...new Set([
        ...planned.map((a) => a.projectId),
        ...hours.flatMap((h) => (h.projectId ? [h.projectId] : [])),
      ]),
    ];
    const named = new Map(
      (projectIds.length
        ? await tx
            .select({ id: projects.id, code: projects.code, name: projects.name })
            .from(projects)
            .where(inArray(projects.id, projectIds))
        : []
      ).map((p) => [p.id, p]),
    );
    const plans = groupBy(planned, (a) => a.employeeId);
    const sheetOf = new Map(approved.map((t) => [`${t.employeeId}|${t.month.slice(0, 7)}`, t.id]));
    const entriesOf = groupBy(hours, (h) => h.timesheetId);

    for (const month of months) {
      const shares = out.get(month)!;
      for (const id of ids) {
        const timesheetId = sheetOf.get(`${id}|${month}`) ?? null;
        const entries: TimesheetHours[] | null = timesheetId
          ? (entriesOf.get(timesheetId) ?? [])
          : null;
        const split = sharesOf(plans.get(id) ?? [], entries, month);
        // In a fixed order, so every split of the same amount rounds the same way.
        shares.set(id, {
          basis: split.basis,
          timesheetId: split.basis === 'timesheet' ? timesheetId : null,
          shares: split.shares
            .map((s) => ({
              ...s,
              code: named.get(s.projectId)!.code,
              name: named.get(s.projectId)!.name,
            }))
            .toSorted(
              (a, b) => a.code.localeCompare(b.code) || a.costKind.localeCompare(b.costKind),
            ),
        });
      }
    }
    return out;
  }
}
