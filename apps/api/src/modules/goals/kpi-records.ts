import { attendanceDays, goals, productionEntries, type Tx } from '@gp/db';
import { goalProgress, todayIn, type AttendanceStatus, type KpiReading } from '@gp/shared';
import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { employeesInUnits, unitAndBelow } from '../employees/employee.queries.js';
import type { GoalRow } from './access.js';

// KPIs read from the records instead of typed: the attendance rate from processed attendance,
// and output against target from daily production (the RMG pack). Reading a goal works its
// value out afresh without writing; the daily job, and changes that write the goal anyway,
// store it. Nobody can type a better number.

/** A share in percent to two decimals; null when there is nothing to divide by. */
export const percentOf = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 10_000) / 100 : null;

/**
 * Days present of the scheduled working days, from processed days on working days (weekly
 * offs and holidays are not scheduled). Approved leave is taken out of the days scheduled, so
 * leave a person is entitled to never lowers their rate; a day with half a day's leave is
 * half a day scheduled. A half day present counts a half, and a day with one punch counts as
 * present, as payroll pays it until it is corrected. Days not over yet are left out.
 */
export function attendanceShare(
  rows: readonly { status: AttendanceStatus; leaveDays: number; days: number }[],
): { presentDays: number; workingDays: number } {
  let presentDays = 0;
  let workingDays = 0;
  for (const r of rows) {
    if (r.status === 'pending' || r.status === 'off') continue;
    const scheduled = Math.max(0, 1 - r.leaveDays) * r.days;
    workingDays += scheduled;
    if (r.status === 'present' || r.status === 'missing_punch') presentDays += scheduled;
    else if (r.status === 'half_day') presentDays += scheduled / 2;
  }
  return { presentDays, workingDays };
}

/** The period read so far: from the goal's start to today, or to its due date once past. */
export function readingPeriod(
  goal: Pick<GoalRow, 'startsOn' | 'dueOn'>,
  today: string,
): { from: string; to: string } | null {
  if (!goal.startsOn) return null;
  const to = goal.dueOn && goal.dueOn < today ? goal.dueOn : today;
  return { from: goal.startsOn, to };
}

async function whoseAttendance(tx: Tx, goal: GoalRow, today: string): Promise<SQL> {
  if (goal.employeeId) return eq(attendanceDays.employeeId, goal.employeeId);
  // A unit's people are those whose job is in it, or in a unit below it, today.
  const units = await unitAndBelow(tx, goal.orgUnitId!);
  return inArray(attendanceDays.employeeId, employeesInUnits(tx, units, today));
}

async function whoseProduction(tx: Tx, goal: GoalRow): Promise<SQL> {
  if (goal.employeeId) return eq(productionEntries.employeeId, goal.employeeId);
  // Entries are filed under the line the worker was on that day, as line reports read them.
  return inArray(productionEntries.orgUnitId, await unitAndBelow(tx, goal.orgUnitId!));
}

/** The KPI's reading over its period so far, and its value in percent (null: no data yet). */
export async function readKpi(
  tx: Tx,
  goal: GoalRow,
  today = todayIn(),
): Promise<{ reading: KpiReading; value: number | null } | null> {
  const period = readingPeriod(goal, today);
  if (!period || goal.source === 'manual') return null;
  const { from, to } = period;
  const empty = to < from;

  if (goal.source === 'attendance_rate') {
    const where = and(
      await whoseAttendance(tx, goal, today),
      eq(attendanceDays.dayType, 'working'),
      gte(attendanceDays.date, from),
      lte(attendanceDays.date, to),
    );
    const rows = empty
      ? []
      : await tx
          .select({
            status: attendanceDays.status,
            leaveDays: attendanceDays.leaveDays,
            days: sql<number>`count(*)::int`,
          })
          .from(attendanceDays)
          .where(where)
          .groupBy(attendanceDays.status, attendanceDays.leaveDays);
    const [people] = empty
      ? []
      : await tx
          .select({ n: sql<number>`count(distinct ${attendanceDays.employeeId})::int` })
          .from(attendanceDays)
          .where(where);
    const share = attendanceShare(rows);
    return {
      reading: { source: 'attendance_rate', from, to, ...share, people: people?.n ?? 0 },
      value: percentOf(share.presentDays, share.workingDays),
    };
  }

  // Only entries for operations with a day target count: the rest have nothing to beat.
  const [totals] = empty
    ? []
    : await tx
        .select({
          pieces: sql<string>`coalesce(sum(${productionEntries.quantity}) filter (where ${productionEntries.dailyTarget} > 0), 0)::text`,
          target: sql<string>`coalesce(sum(${productionEntries.dailyTarget}) filter (where ${productionEntries.dailyTarget} > 0), 0)::text`,
          people: sql<number>`count(distinct ${productionEntries.employeeId}) filter (where ${productionEntries.dailyTarget} > 0)::int`,
        })
        .from(productionEntries)
        .where(
          and(
            await whoseProduction(tx, goal),
            gte(productionEntries.date, from),
            lte(productionEntries.date, to),
          ),
        );
  const pieces = Number(totals?.pieces ?? 0);
  const target = Number(totals?.target ?? 0);
  return {
    reading: { source: 'production_target', from, to, pieces, target, people: totals?.people ?? 0 },
    value: percentOf(pieces, target),
  };
}

/** A KPI from the records as read now: how, its value in the column's form, and its progress. */
export interface RecordKpi {
  reading: KpiReading;
  currentValue: string | null;
  progress: number;
}

/**
 * Reads the KPIs from the records among these goals that are still open; completed and
 * dropped goals keep the value they closed with. Nothing is written.
 */
export async function readRecordKpis(
  tx: Tx,
  rows: readonly GoalRow[],
  today = todayIn(),
): Promise<Map<string, RecordKpi>> {
  const out = new Map<string, RecordKpi>();
  for (const goal of rows) {
    if (goal.kind !== 'kpi' || goal.source === 'manual') continue;
    if (goal.status !== 'draft' && goal.status !== 'agreed') continue;
    const read = await readKpi(tx, goal, today);
    if (!read) continue;
    const currentValue = read.value === null ? null : read.value.toFixed(2);
    out.set(goal.id, {
      reading: read.reading,
      currentValue,
      progress: goalProgress({ ...goal, currentValue, direction: 'higher' }),
    });
  }
  return out;
}

/** The goals as read now: open KPIs from the records with their value and progress of today. */
export async function withRecordKpis(
  tx: Tx,
  rows: readonly GoalRow[],
  today = todayIn(),
): Promise<GoalRow[]> {
  const read = await readRecordKpis(tx, rows, today);
  return rows.map((g) => {
    const kpi = read.get(g.id);
    return kpi ? { ...g, currentValue: kpi.currentValue, progress: kpi.progress } : g;
  });
}

/**
 * Stores what the records say now for these goals, where it changed: for the daily job and
 * for changes that write the goal anyway. The rows are brought up to date in place. Returns
 * how many goals changed.
 */
export async function storeRecordKpis(tx: Tx, rows: GoalRow[], today = todayIn()): Promise<number> {
  const read = await readRecordKpis(tx, rows, today);
  let changed = 0;
  for (const goal of rows) {
    const kpi = read.get(goal.id);
    if (!kpi || (kpi.currentValue === goal.currentValue && kpi.progress === goal.progress)) {
      continue;
    }
    const { currentValue, progress } = kpi;
    await tx.update(goals).set({ currentValue, progress }).where(eq(goals.id, goal.id));
    Object.assign(goal, { currentValue, progress });
    changed += 1;
  }
  return changed;
}
