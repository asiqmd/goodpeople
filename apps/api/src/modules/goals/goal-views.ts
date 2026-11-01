import { employees, goals, orgUnits, reviewCycles, tenantUsers, type Tx } from '@gp/db';
import type { EmployeeRef, GoalCycleRef, GoalUnitRef, GoalView, KpiReading } from '@gp/shared';
import { and, inArray, or, sql } from 'drizzle-orm';
import type { CycleRow, GoalRow } from './access.js';
import { readRecordKpis } from './kpi-records.js';

// Goals as the API sends them, with their person or unit, cycle and parent by name.

const employeeRefSelect = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  fullName: employees.fullName,
  fullNameBn: employees.fullNameBn,
};

export async function employeeRefs(tx: Tx, ids: string[]): Promise<Map<string, EmployeeRef>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const rows = await tx
    .select(employeeRefSelect)
    .from(employees)
    .where(inArray(employees.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

const unitRefSelect = {
  id: orgUnits.id,
  code: orgUnits.code,
  name: orgUnits.name,
  nameBn: orgUnits.nameBn,
  legalEntityId: orgUnits.legalEntityId,
};

export async function unitRefs(tx: Tx, ids: string[]): Promise<Map<string, GoalUnitRef>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const rows = await tx.select(unitRefSelect).from(orgUnits).where(inArray(orgUnits.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

export const toCycleRef = (c: CycleRow): GoalCycleRef => ({
  id: c.id,
  name: c.name,
  status: c.status,
  periodStart: c.periodStart,
  periodEnd: c.periodEnd,
  goalsDueOn: c.goalsDueOn,
});

/** Cycles goals may be put in: being set up or under way, for these companies or every one. */
export function openCycles(tx: Tx, legalEntityIds: string[] | null): Promise<CycleRow[]> {
  return tx
    .select()
    .from(reviewCycles)
    .where(
      and(
        inArray(reviewCycles.status, ['draft', 'active']),
        legalEntityIds
          ? or(
              sql`cardinality(${reviewCycles.legalEntityIds}) = 0`,
              ...legalEntityIds.map((id) => sql`${id}::uuid = any(${reviewCycles.legalEntityIds})`),
            )
          : undefined,
      ),
    )
    .orderBy(reviewCycles.periodStart);
}

/** Rows by id, without a query when there are none. */
const byIds = <T>(ids: string[], query: (ids: string[]) => Promise<T[]>): Promise<T[]> =>
  ids.length ? query([...new Set(ids)]) : Promise.resolve([]);

/** The views of these goals, with KPIs from the records as the records say today. */
export async function goalViews(tx: Tx, rows: GoalRow[]): Promise<GoalView[]> {
  if (rows.length === 0) return [];
  const kpis = await readRecordKpis(tx, rows);
  const pick = (f: (g: GoalRow) => string | null) => rows.flatMap((g) => f(g) ?? []);
  // One query after another: a transaction runs one at a time.
  const people = await employeeRefs(
    tx,
    pick((g) => g.employeeId),
  );
  const units = await unitRefs(
    tx,
    pick((g) => g.orgUnitId),
  );
  const cycles = await byIds(
    pick((g) => g.cycleId),
    (ids) => tx.select().from(reviewCycles).where(inArray(reviewCycles.id, ids)),
  );
  const parents = await byIds(
    pick((g) => g.parentGoalId),
    (ids) =>
      tx.select({ id: goals.id, title: goals.title }).from(goals).where(inArray(goals.id, ids)),
  );
  const agreers = await byIds(
    pick((g) => g.agreedByUserId),
    (ids) =>
      tx
        .select({ id: tenantUsers.id, name: tenantUsers.name })
        .from(tenantUsers)
        .where(inArray(tenantUsers.id, ids)),
  );
  const cycleOf = new Map(cycles.map((c) => [c.id, toCycleRef(c)]));
  const parentOf = new Map(parents.map((p) => [p.id, p]));
  const agreerOf = new Map(agreers.map((u) => [u.id, u.name]));
  return rows.map((g) => {
    const kpi = kpis.get(g.id);
    const now = kpi ? { ...g, currentValue: kpi.currentValue, progress: kpi.progress } : g;
    return toGoalView(now, {
      employee: g.employeeId ? (people.get(g.employeeId) ?? null) : null,
      orgUnit: g.orgUnitId ? (units.get(g.orgUnitId) ?? null) : null,
      cycle: g.cycleId ? (cycleOf.get(g.cycleId) ?? null) : null,
      parent: g.parentGoalId ? (parentOf.get(g.parentGoalId) ?? null) : null,
      agreedBy: g.agreedByUserId ? (agreerOf.get(g.agreedByUserId) ?? null) : null,
      reading: kpi?.reading ?? null,
    });
  });
}

function toGoalView(
  g: GoalRow,
  refs: Pick<GoalView, 'employee' | 'orgUnit' | 'cycle' | 'parent' | 'agreedBy'> & {
    reading: KpiReading | null;
  },
): GoalView {
  return {
    id: g.id,
    ...refs,
    title: g.title,
    description: g.description,
    kind: g.kind,
    keyResults: g.keyResults,
    measureUnit: g.measureUnit,
    target: g.target,
    direction: g.direction,
    source: g.source,
    currentValue: g.currentValue,
    progress: g.progress,
    weight: g.weight,
    startsOn: g.startsOn,
    dueOn: g.dueOn,
    status: g.status,
    agreedAt: g.agreedAt?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}
