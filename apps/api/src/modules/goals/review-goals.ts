import { goals, reviewCycles, type Tx } from '@gp/db';
import { and, asc, count, eq, inArray, isNull, or } from 'drizzle-orm';
import type { GoalRow } from './access.js';
import { storeRecordKpis, withRecordKpis } from './kpi-records.js';

// What reviews read from goals (Phase 4 M2): the goals a review rates, and the drafts a
// manager has to agree. Inside the caller's transaction.

/**
 * A person's agreed goals for a cycle (completed ones too: they were agreed), oldest first,
 * with KPIs from the records as the records say today. These are what the review forms rate.
 * Nothing is written: reads may call it.
 */
export async function agreedGoalsForReview(
  tx: Tx,
  employeeId: string,
  cycleId: string,
): Promise<GoalRow[]> {
  const rows = await tx
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, employeeId),
        eq(goals.cycleId, cycleId),
        inArray(goals.status, ['agreed', 'completed']),
      ),
    )
    .orderBy(asc(goals.createdAt));
  return withRecordKpis(tx, rows);
}

/**
 * Stores the value and progress the records give these goals today, for a change that writes
 * anyway (submitting a review, say). Returns how many goals changed.
 */
export async function refreshRecordKpis(tx: Tx, goalIds: string[]): Promise<number> {
  if (goalIds.length === 0) return 0;
  const rows = await tx.select().from(goals).where(inArray(goals.id, goalIds)).for('update');
  return storeRecordKpis(tx, rows);
}

/** Draft goals of these people (a manager's team) waiting for agreement, in open cycles. */
export async function goalsToAgree(tx: Tx, employeeIds: string[]): Promise<number> {
  if (employeeIds.length === 0) return 0;
  const [row] = await tx
    .select({ n: count() })
    .from(goals)
    .leftJoin(reviewCycles, eq(reviewCycles.id, goals.cycleId))
    .where(
      and(
        inArray(goals.employeeId, employeeIds),
        eq(goals.status, 'draft'),
        or(isNull(goals.cycleId), inArray(reviewCycles.status, ['draft', 'active'])),
      ),
    );
  return row?.n ?? 0;
}
