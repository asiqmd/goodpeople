import {
  orgUnits,
  payrollRunItems,
  payrollRuns,
  productionEntries,
  productionOperations,
  type Tx,
} from '@gp/db';
import type { ProductionOperationView, ProductionUnitRef } from '@gp/shared';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { conflict } from '../../common/errors.js';
import type { LockedPeriod } from './production-changes.js';

type OperationRow = typeof productionOperations.$inferSelect;

export const toOperationView = (o: OperationRow): ProductionOperationView => ({
  id: o.id,
  code: o.code,
  name: o.name,
  nameBn: o.nameBn,
  style: o.style,
  pieceRate: o.pieceRate,
  dailyTarget: o.dailyTarget,
  incentiveRate: o.incentiveRate,
  isActive: o.isActive,
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
});

/** Units by id, as references. */
export async function unitRefs(tx: Tx, ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  const out = new Map<string, ProductionUnitRef>();
  if (wanted.length === 0) return out;
  const rows = await tx
    .select({ id: orgUnits.id, code: orgUnits.code, name: orgUnits.name, nameBn: orgUnits.nameBn })
    .from(orgUnits)
    .where(inArray(orgUnits.id, wanted));
  for (const r of rows) out.set(r.id, r);
  return out;
}

/**
 * Totals of entries, worked out exactly as payroll's PIECES, PIECE_EARNINGS and
 * PRODUCTION_INCENTIVE are (run-context.ts): each entry at the rates entered with it, and
 * the incentive per entry for pieces above that day's target.
 */
export const entryTotals = {
  pieces: sql<string>`coalesce(sum(${productionEntries.quantity}), 0)::text`,
  earnings: sql<string>`coalesce(sum(${productionEntries.quantity} * ${productionEntries.pieceRate}), 0)::text`,
  incentive: sql<string>`coalesce(sum(greatest(0, ${productionEntries.quantity} - ${productionEntries.dailyTarget}) * ${productionEntries.incentiveRate}), 0)::text`,
};

/**
 * Periods whose pay is locked, per person, overlapping two dates. A day is locked for a
 * person once a locked regular or settlement run covering it paid them: those runs pay the
 * month's wages and production with them. Adjustment runs only pay differences on periods
 * already locked, bonus and participation-fund runs pay no production, and runs not locked
 * yet are computed again before they are approved.
 */
export async function lockedPeriods(
  tx: Tx,
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, LockedPeriod[]>> {
  const out = new Map<string, LockedPeriod[]>();
  if (employeeIds.length === 0) return out;
  const rows = await tx
    .select({
      employeeId: payrollRunItems.employeeId,
      start: payrollRuns.periodStart,
      end: payrollRuns.periodEnd,
    })
    .from(payrollRunItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
    .where(
      and(
        eq(payrollRuns.status, 'locked'),
        inArray(payrollRuns.kind, ['regular', 'settlement']),
        inArray(payrollRunItems.employeeId, employeeIds),
        lte(payrollRuns.periodStart, to),
        gte(payrollRuns.periodEnd, from),
      ),
    );
  for (const r of rows) {
    out.set(r.employeeId, [...(out.get(r.employeeId) ?? []), { start: r.start, end: r.end }]);
  }
  return out;
}

/**
 * Runs whose results no longer match production once it changes: computed runs go back to
 * draft, as when an amount is entered in a run; a run waiting for approval must be sent
 * back first, so what the approver sees is what is paid.
 */
export async function reopenRunsFor(tx: Tx, entries: { employeeId: string; date: string }[]) {
  if (entries.length === 0) return;
  const dates = entries.map((e) => e.date).toSorted();
  const rows = await tx
    .selectDistinct({
      id: payrollRuns.id,
      status: payrollRuns.status,
      employeeId: payrollRunItems.employeeId,
      start: payrollRuns.periodStart,
      end: payrollRuns.periodEnd,
    })
    .from(payrollRunItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
    .where(
      and(
        inArray(payrollRuns.status, ['computed', 'pending']),
        inArray(payrollRuns.kind, ['regular', 'adjustment', 'settlement']),
        inArray(
          payrollRunItems.employeeId,
          entries.map((e) => e.employeeId),
        ),
        lte(payrollRuns.periodStart, dates.at(-1)!),
        gte(payrollRuns.periodEnd, dates[0]!),
      ),
    );
  const touched = rows.filter((r) =>
    entries.some((e) => e.employeeId === r.employeeId && e.date >= r.start && e.date <= r.end),
  );
  if (touched.some((r) => r.status === 'pending')) {
    throw conflict(
      'payroll_pending',
      'This pay is waiting for approval in payroll; send the run back before changing production',
    );
  }
  const ids = [...new Set(touched.map((r) => r.id))];
  if (ids.length)
    await tx.update(payrollRuns).set({ status: 'draft' }).where(inArray(payrollRuns.id, ids));
}
