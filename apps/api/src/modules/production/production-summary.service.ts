import { Injectable } from '@nestjs/common';
import { employees, productionEntries } from '@gp/db';
import {
  Decimal,
  money,
  monthBounds,
  type ProductionSummaryBy,
  type ProductionSummaryQuery,
  type ProductionSummaryView,
  type ProductionTotals,
  type TenantWithAccess,
} from '@gp/shared';
import { and, asc, gte, inArray, lte, sql } from 'drizzle-orm';
import { TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { unitAndBelow } from '../employees/employee.queries.js';
import { csv } from '../payroll/disbursement.js';
import { extraVariablesOf } from '../payroll/run-context.js';
import { BOM } from './production-entries.service.js';
import { entryTotals, unitRefs } from './production.queries.js';

const totalsOf = (r: {
  pieces: string;
  earnings: string;
  incentive: string;
}): ProductionTotals => ({
  pieces: Number(r.pieces),
  pieceEarnings: money(r.earnings),
  incentive: money(r.incentive),
});

const amounts = (t: ProductionTotals) => [String(t.pieces), t.pieceEarnings, t.incentive];

/** A month's production by worker, line and day. */
@Injectable()
export class ProductionSummaryService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Worker figures are what payroll reads for the month (extraVariablesOf), so they match the
   * payslip. Payroll pays a piece-rated worker the larger of these piece earnings and the time
   * wage, so the grade's minimum wage is always met (Labour Act s.149).
   */
  summary(query: ProductionSummaryQuery, tenant: TenantWithAccess): Promise<ProductionSummaryView> {
    return this.tenantDb.run(async (tx) => {
      const { start: from, end: to } = monthBounds(query.month);
      const units = query.orgUnitId ? await unitAndBelow(tx, query.orgUnitId) : null;
      const where = and(
        gte(productionEntries.date, from),
        lte(productionEntries.date, to),
        units ? inArray(productionEntries.orgUnitId, units) : undefined,
      );
      const [total] = await tx.select(entryTotals).from(productionEntries).where(where);
      const lines = await tx
        .select({
          orgUnitId: productionEntries.orgUnitId,
          workers: sql<number>`count(distinct ${productionEntries.employeeId})::int`,
          ...entryTotals,
        })
        .from(productionEntries)
        .where(where)
        .groupBy(productionEntries.orgUnitId);
      const days = await tx
        .select({
          date: productionEntries.date,
          workers: sql<number>`count(distinct ${productionEntries.employeeId})::int`,
          ...entryTotals,
        })
        .from(productionEntries)
        .where(where)
        .groupBy(productionEntries.date)
        .orderBy(asc(productionEntries.date));
      const workers = await tx
        .select({
          employeeId: productionEntries.employeeId,
          days: sql<number>`count(distinct ${productionEntries.date})::int`,
          lastUnit: sql<
            string | null
          >`(array_agg(${productionEntries.orgUnitId} order by ${productionEntries.date} desc, ${productionEntries.updatedAt} desc))[1]`,
        })
        .from(productionEntries)
        .where(where)
        .groupBy(productionEntries.employeeId);
      const ids = workers.map((w) => w.employeeId);
      const people = ids.length
        ? new Map(
            (
              await tx
                .select({
                  id: employees.id,
                  employeeCode: employees.employeeCode,
                  fullName: employees.fullName,
                  fullNameBn: employees.fullNameBn,
                })
                .from(employees)
                .where(inArray(employees.id, ids))
            ).map((p) => [p.id, p]),
          )
        : new Map<string, Parameters<typeof employeeRef>[0]>();
      const payroll = await extraVariablesOf(
        tx,
        ids,
        { periodStart: from, periodEnd: to },
        tenant,
        {
          production: true,
          unionDues: false,
        },
      );
      const refs = await unitRefs(tx, [
        ...lines.map((l) => l.orgUnitId),
        ...workers.map((w) => w.lastUnit),
      ]);
      const ref = (id: string | null) => (id ? (refs.get(id) ?? null) : null);
      return {
        month: query.month,
        from,
        to,
        totals: totalsOf(total!),
        workers: workers
          .map((w) => {
            const figures = payroll.get(w.employeeId) ?? {};
            const earnings = figures.PIECE_EARNINGS ?? '0';
            return {
              employee: employeeRef(people.get(w.employeeId)!),
              orgUnit: ref(w.lastUnit),
              days: w.days,
              pieces: Number(figures.PIECES ?? 0),
              pieceEarnings: money(earnings),
              incentive: money(figures.PRODUCTION_INCENTIVE ?? 0),
              averageDaily: money(new Decimal(earnings).dividedBy(Math.max(1, w.days))),
            };
          })
          .toSorted((a, b) => a.employee.employeeCode.localeCompare(b.employee.employeeCode)),
        lines: lines
          .map((l) => ({ orgUnit: ref(l.orgUnitId), workers: l.workers, ...totalsOf(l) }))
          .toSorted((a, b) => (a.orgUnit?.name ?? '~').localeCompare(b.orgUnit?.name ?? '~')),
        days: days.map((d) => ({ date: d.date, workers: d.workers, ...totalsOf(d) })),
      };
    });
  }

  /** The summary as CSV, one table: by worker, line or day, with a total row. */
  async file(
    query: ProductionSummaryQuery & { by: ProductionSummaryBy },
    tenant: TenantWithAccess,
  ): Promise<{ text: string; fileName: string }> {
    const view = await this.summary(query, tenant);
    const total = amounts(view.totals);
    let rows: string[][];
    if (query.by === 'line') {
      rows = [
        ['Line code', 'Line', 'Workers', 'Pieces', 'Piece earnings', 'Incentive'],
        ...view.lines.map((l) => [
          l.orgUnit?.code ?? '',
          l.orgUnit?.name ?? '',
          String(l.workers),
          ...amounts(l),
        ]),
        ['', 'Total', '', ...total],
      ];
    } else if (query.by === 'day') {
      rows = [
        ['Date', 'Workers', 'Pieces', 'Piece earnings', 'Incentive'],
        ...view.days.map((d) => [d.date, String(d.workers), ...amounts(d)]),
        ['Total', '', ...total],
      ];
    } else {
      rows = [
        [
          'Employee code',
          'Name',
          'Line',
          'Days',
          'Pieces',
          'Piece earnings',
          'Incentive',
          'Average per day',
        ],
        ...view.workers.map((w) => [
          w.employee.employeeCode,
          w.employee.fullName,
          w.orgUnit?.name ?? '',
          String(w.days),
          ...amounts(w),
          w.averageDaily,
        ]),
        ['', 'Total', '', '', ...total, ''],
      ];
    }
    return { text: BOM + csv(rows), fileName: `production-${query.month}-${query.by}.csv` };
  }
}
