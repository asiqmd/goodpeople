import { NotFoundException } from '@nestjs/common';
import { goals, jobAssignments, orgUnits, reviewCycles, type Tx } from '@gp/db';
import { todayIn, type GoalActions, type GoalStatus } from '@gp/shared';
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { conflict } from '../../common/errors.js';
import { userCan } from '../../common/roles.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { managesPerson, reportsBelow } from '../development/access.js';
import { employeeOfUser, inForceOn } from '../employees/employee.queries.js';

// Who may see and change which goals. A person's goals are theirs, their manager's (anyone
// they report to, directly or through others) and HR's within the companies the login looks
// after; a unit's goals are seen by the people of its company and written by HR or by those
// with reports in the unit. Anyone else finds nothing.

export type GoalRow = typeof goals.$inferSelect;
export type UnitRow = typeof orgUnits.$inferSelect;
export type CycleRow = typeof reviewCycles.$inferSelect;

export const notFound = (what = 'goal') =>
  new NotFoundException(`No such ${what}, or it is not yours to see`);

/** The signed-in login as goals see it. */
export interface Viewer {
  user: AuthUser;
  /** May manage performance, for the companies in `companies` (null: every company). */
  manage: boolean;
  companies: string[] | null;
  employeeId: string | null;
  /** The company and unit of the login's own job. */
  legalEntityId: string | null;
  orgUnitId: string | null;
  /** Everyone below the login today in the line of management: reports, their reports… */
  team: Set<string>;
  /** Units someone reporting straight to the login works in today. */
  managedUnits: Set<string>;
}

/** Someone's job today; for someone who has left or not started, their latest one. */
export async function jobOf(tx: Tx, employeeId: string) {
  const today = todayIn();
  const rows = await tx
    .select()
    .from(jobAssignments)
    .where(eq(jobAssignments.employeeId, employeeId))
    .orderBy(desc(jobAssignments.effectiveFrom));
  return (
    rows.find((j) => j.effectiveFrom <= today && (!j.effectiveTo || j.effectiveTo >= today)) ??
    rows[0] ??
    null
  );
}

export async function viewerOf(tx: Tx, user: AuthUser): Promise<Viewer> {
  const companies = await entityScopeOf(tx, user.id);
  const me = await employeeOfUser(tx, user.id);
  const job = me ? await jobOf(tx, me.id) : null;
  const team = me ? await reportsBelow(tx, me.id, todayIn()) : [];
  const units = me
    ? await tx
        .selectDistinct({ id: jobAssignments.orgUnitId })
        .from(jobAssignments)
        .where(
          and(
            eq(jobAssignments.managerId, me.id),
            inForceOn(todayIn()),
            isNotNull(jobAssignments.orgUnitId),
          ),
        )
    : [];
  return {
    user,
    manage: userCan(user, 'performance.manage'),
    companies,
    employeeId: me?.id ?? null,
    legalEntityId: job?.legalEntityId ?? null,
    orgUnitId: job?.orgUnitId ?? null,
    team: new Set(team),
    managedUnits: new Set(units.flatMap((u) => u.id ?? [])),
  };
}

/** HR of this company: `performance.manage`, and the company among the login's. */
export const hrOf = (viewer: Viewer, legalEntityId: string) =>
  viewer.manage && (!viewer.companies || viewer.companies.includes(legalEntityId));

/**
 * How the viewer stands to one person: the person themselves, someone they report to, or HR
 * of their company. None of these: the person is not found.
 */
export interface PersonAccess {
  own: boolean;
  /** Their manager, or HR: drafts, agrees, completes and drops their goals. */
  leads: boolean;
}

export async function personAccess(
  tx: Tx,
  viewer: Viewer,
  employeeId: string,
): Promise<PersonAccess | null> {
  const own = viewer.employeeId === employeeId;
  // The line of management, never the unit: a colleague on the same line finds nothing.
  const leads = await managesPerson(tx, viewer, employeeId, todayIn());
  return own || leads ? { own, leads } : null;
}

/** Sees a unit's goals: its company's people, HR of the company, and those managing in it. */
export function unitAccess(viewer: Viewer, unit: Pick<UnitRow, 'id' | 'legalEntityId'>) {
  const writes = hrOf(viewer, unit.legalEntityId) || viewer.managedUnits.has(unit.id);
  return { sees: writes || viewer.legalEntityId === unit.legalEntityId, writes };
}

export interface GoalAccess {
  goal: GoalRow;
  unit: UnitRow | null;
  cycle: CycleRow | null;
  own: boolean;
  leads: boolean;
}

/** The goal for those who may see it; not found for anyone else. */
export async function goalFor(
  tx: Tx,
  viewer: Viewer,
  id: string,
  options: { lock?: boolean } = {},
): Promise<GoalAccess> {
  const query = tx.select().from(goals).where(eq(goals.id, id));
  const [goal] = options.lock ? await query.for('update') : await query;
  if (!goal) throw notFound();
  const [cycle] = goal.cycleId
    ? await tx.select().from(reviewCycles).where(eq(reviewCycles.id, goal.cycleId))
    : [];
  if (goal.employeeId) {
    const access = await personAccess(tx, viewer, goal.employeeId);
    if (!access) throw notFound();
    return { goal, unit: null, cycle: cycle ?? null, ...access };
  }
  const [unit] = await tx.select().from(orgUnits).where(eq(orgUnits.id, goal.orgUnitId!));
  const access = unit ? unitAccess(viewer, unit) : null;
  if (!unit || !access?.sees) throw notFound();
  return { goal, unit, cycle: cycle ?? null, own: false, leads: access.writes };
}

const OPEN: readonly GoalStatus[] = ['draft', 'agreed'];

/** A cycle whose goals still change: being set up, or under way. */
export const cycleOpen = (cycle: Pick<CycleRow, 'status'> | null) =>
  !cycle || cycle.status === 'draft' || cycle.status === 'active';

/** Once its cycle has moved on to calibration, a goal's terms are what the review rated. */
export function mustBeInOpenCycle(cycle: CycleRow | null) {
  if (!cycleOpen(cycle)) {
    throw conflict(
      'goal_cycle_closed',
      `The review cycle ${cycle!.name} is past setting goals; its goals no longer change`,
    );
  }
}

/**
 * What the viewer may do with a goal. Nobody agrees, completes or drops an agreed goal of
 * their own: their manager or HR does. A person may drop a draft of their own.
 */
export function actionsOf(access: GoalAccess): GoalActions {
  const { goal, own, leads } = access;
  const open = OPEN.includes(goal.status);
  const changes = open && cycleOpen(access.cycle);
  const leadsOther = leads && !own;
  return {
    edit: changes && (own || leads),
    agree: changes && goal.status === 'draft' && !!goal.employeeId && leadsOther,
    checkin: open && (own || leads),
    complete: goal.status === 'agreed' && leadsOther,
    drop: changes && ((goal.status === 'draft' && own) || leadsOther),
    submit: changes && goal.status === 'draft' && own,
  };
}

/** A unit and every unit above it, nearest first. */
export async function unitsAbove(tx: Tx, unitId: string): Promise<string[]> {
  const all = await tx.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
  const parent = new Map(all.map((u) => [u.id, u.parentId]));
  const path: string[] = [];
  for (let at: string | null | undefined = unitId; at && !path.includes(at); at = parent.get(at)) {
    path.push(at);
  }
  return path;
}

/**
 * The goals a goal may serve: for a person's, the goals of their unit and the units above it,
 * and their manager's own goals; for a unit's, the goals of the units above it. Open ones only.
 */
export async function alignableGoals(
  tx: Tx,
  owner: { employeeId: string | null; orgUnitId: string | null },
): Promise<GoalRow[]> {
  const live = inArray(goals.status, ['draft', 'agreed']);
  if (owner.employeeId) {
    const job = await jobOf(tx, owner.employeeId);
    const units = job?.orgUnitId ? await unitsAbove(tx, job.orgUnitId) : [];
    const sources = [
      units.length ? inArray(goals.orgUnitId, units) : undefined,
      job?.managerId ? eq(goals.employeeId, job.managerId) : undefined,
    ].filter((c) => c !== undefined);
    if (sources.length === 0) return [];
    return tx
      .select()
      .from(goals)
      .where(and(live, or(...sources)))
      .orderBy(goals.createdAt);
  }
  const above = (await unitsAbove(tx, owner.orgUnitId!)).slice(1);
  if (above.length === 0) return [];
  return tx
    .select()
    .from(goals)
    .where(and(live, inArray(goals.orgUnitId, above)))
    .orderBy(goals.createdAt);
}
