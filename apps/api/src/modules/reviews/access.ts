import { NotFoundException } from '@nestjs/common';
import { employees, reviewCycles, reviews, type Tx } from '@gp/db';
import { todayIn, type ReviewRole } from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { inScope } from '../access-scopes/employee-scope.js';
import { managersOf } from '../development/access.js';
import { employeeOfUser } from '../employees/employee.queries.js';

// Who may see and change what in review cycles. The person sees their own review; their
// manager when the cycle was launched, and anyone above that manager in the line of management
// (never a colleague of the same unit), writes the manager's part; `performance.manage` sees every cycle and review of the companies it looks after and
// writes the manager's part where there is no manager. Anyone else finds nothing.

export type CycleRow = typeof reviewCycles.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;

export const notFound = (what = 'review') =>
  new NotFoundException(`No such ${what}, or it is not yours to see`);

/** The signed-in login as performance sees it. */
export interface Viewer {
  user: AuthUser;
  userId: string;
  /** May manage performance, for the companies in `companies` (null: every company). */
  manage: boolean;
  companies: string[] | null;
  employeeId: string | null;
}

export async function viewerOf(tx: Tx, user: AuthUser): Promise<Viewer> {
  const companies = await entityScopeOf(tx, user.id);
  const me = await employeeOfUser(tx, user.id);
  return {
    user,
    userId: user.id,
    manage: userCan(user, 'performance.manage'),
    companies,
    employeeId: me?.id ?? null,
  };
}

/** Sees the cycle: it covers every company, or one of the login's. */
export const seesCycle = (viewer: Viewer, cycle: Pick<CycleRow, 'legalEntityIds'>) =>
  viewer.manage &&
  (!viewer.companies ||
    cycle.legalEntityIds.length === 0 ||
    cycle.legalEntityIds.some((id) => viewer.companies!.includes(id)));

/** Launches, moves and releases the cycle: every company in it is one of the login's. */
export const changesCycle = (viewer: Viewer, cycle: Pick<CycleRow, 'legalEntityIds'>) =>
  viewer.manage &&
  (!viewer.companies ||
    (cycle.legalEntityIds.length > 0 &&
      cycle.legalEntityIds.every((id) => viewer.companies!.includes(id))));

export async function cycleFor(
  tx: Tx,
  viewer: Viewer,
  id: string,
  options: { lock?: boolean } = {},
): Promise<{ cycle: CycleRow; canChange: boolean }> {
  const query = tx.select().from(reviewCycles).where(eq(reviewCycles.id, id));
  const [cycle] = options.lock ? await query.for('update') : await query;
  if (!cycle || !seesCycle(viewer, cycle)) throw notFound('review cycle');
  return { cycle, canChange: changesCycle(viewer, cycle) };
}

/** Whether the viewer writes the manager's part: the review's manager or someone above them. */
export async function managesReview(
  tx: Tx,
  viewer: Viewer,
  review: Pick<ReviewRow, 'managerEmployeeId' | 'employeeId'>,
): Promise<boolean> {
  if (!viewer.employeeId || !review.managerEmployeeId) return false;
  if (viewer.employeeId === review.employeeId) return false;
  if (review.managerEmployeeId === viewer.employeeId) return true;
  return (await managersOf(tx, review.managerEmployeeId, todayIn())).includes(viewer.employeeId);
}

export interface ReviewAccess {
  review: ReviewRow;
  cycle: CycleRow;
  role: ReviewRole;
}

/**
 * The review for the person, their manager (or above) and HR of the person's company; not
 * found for anyone else. The person's own review is theirs only, whatever their role.
 */
export async function reviewFor(
  tx: Tx,
  viewer: Viewer,
  id: string,
  options: { lock?: boolean } = {},
): Promise<ReviewAccess> {
  const query = tx
    .select({ review: reviews, cycle: reviewCycles })
    .from(reviews)
    .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
    .where(eq(reviews.id, id));
  const [row] = options.lock ? await query.for('update', { of: reviews }) : await query;
  if (!row) throw notFound();
  const { review, cycle } = row;
  if (viewer.employeeId && review.employeeId === viewer.employeeId) {
    return { review, cycle, role: 'person' };
  }
  if (await managesReview(tx, viewer, review)) return { review, cycle, role: 'manager' };
  if (viewer.manage && (await inScope(tx, viewer.user, review.employeeId))) {
    return { review, cycle, role: 'hr' };
  }
  throw notFound();
}

/** HR writes the manager's part of a review that has no manager. */
export const writesManagerPart = (access: ReviewAccess) =>
  access.role === 'manager' || (access.role === 'hr' && !access.review.managerEmployeeId);

export const employeeRefSelect = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  fullName: employees.fullName,
  fullNameBn: employees.fullNameBn,
};
