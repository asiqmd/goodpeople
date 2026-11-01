import { NotFoundException } from '@nestjs/common';
import { employees, jobAssignments, performanceSettings, userEntityScopes, type Tx } from '@gp/db';
import { DEFAULT_COMPETENCIES, type Competency, type EmployeeRef } from '@gp/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { inScope } from '../access-scopes/employee-scope.js';
import { employeeOfUser, selectAssignments } from '../employees/employee.queries.js';
import { usersWith, type Recipient } from '../notifications/notifications.service.js';

// Who sees a person's improvement plans, probation reviews and performance record: those who
// manage performance, within the companies they look after, and the person's managers (their
// manager, that manager's manager and so on). The person sees their own plans once started and
// their own record, never their probation reviews. Anyone else finds nothing.

export const notFound = (what: string) =>
  new NotFoundException(`No such ${what}, or it is not yours to see`);

export interface Viewer {
  user: AuthUser;
  /** May manage performance (for the companies the login looks after). */
  manage: boolean;
  /** Their employee record, if any: managers and the person are employees. */
  employeeId: string | null;
}

export async function viewerOf(tx: Tx, user: AuthUser): Promise<Viewer> {
  const me = await employeeOfUser(tx, user.id);
  return { user, manage: userCan(user, 'performance.manage'), employeeId: me?.id ?? null };
}

const inForce = (onDate: string) =>
  sql`j.effective_from <= ${onDate} and (j.effective_to is null or j.effective_to >= ${onDate})`;

/**
 * Everyone below a manager on a date: their direct reports, the reports' reports and so on.
 * `union` drops repeats, so a loop in the reporting lines ends.
 */
export async function reportsBelow(tx: Tx, managerId: string, onDate: string): Promise<string[]> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    with recursive team(id) as (
      select j.employee_id from job_assignments j
       where j.manager_id = ${managerId} and ${inForce(onDate)}
      union
      select j.employee_id from job_assignments j join team on j.manager_id = team.id
       where ${inForce(onDate)}
    )
    select id from team where id <> ${managerId}`);
  return rows.map((r) => r.id);
}

/** A person's managers on a date: their manager, that manager's manager and so on. */
export async function managersOf(tx: Tx, employeeId: string, onDate: string): Promise<string[]> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    with recursive chain(id) as (
      select j.manager_id from job_assignments j
       where j.employee_id = ${employeeId} and j.manager_id is not null and ${inForce(onDate)}
      union
      select j.manager_id from job_assignments j join chain on j.employee_id = chain.id
       where j.manager_id is not null and ${inForce(onDate)}
    )
    select id from chain where id <> ${employeeId}`);
  return rows.map((r) => r.id);
}

/**
 * Whether the viewer runs this person's plans and reads their record: HR for the person's
 * company, or one of their managers. Never for themselves.
 */
export async function managesPerson(
  tx: Tx,
  viewer: Viewer,
  employeeId: string,
  onDate: string,
): Promise<boolean> {
  if (viewer.employeeId === employeeId) return false;
  if (viewer.manage && (await inScope(tx, viewer.user, employeeId))) return true;
  if (!viewer.employeeId) return false;
  return (await managersOf(tx, employeeId, onDate)).includes(viewer.employeeId);
}

/**
 * The job a person holds on a date; for someone who has left, their last one; for someone who
 * has not started, their first.
 */
export async function jobOn(tx: Tx, employeeId: string, onDate: string) {
  const history = await selectAssignments(tx, eq(jobAssignments.employeeId, employeeId));
  return pickJob(history, onDate);
}

/** From job histories newest first, the job in force on the date (or the nearest). */
export function pickJob<T extends { a: { effectiveFrom: string; effectiveTo: string | null } }>(
  history: T[],
  onDate: string,
): T | null {
  return (
    history.find(
      (j) => j.a.effectiveFrom <= onDate && (j.a.effectiveTo === null || j.a.effectiveTo >= onDate),
    ) ??
    history.find((j) => j.a.effectiveFrom <= onDate) ??
    history.at(-1) ??
    null
  );
}

/** Logins that manage performance and look after this company. */
export async function performanceManagersOf(tx: Tx, legalEntityId: string): Promise<Recipient[]> {
  const managers = await usersWith(tx, 'performance.manage');
  const ids = managers.flatMap((m) => m.userId ?? []);
  const scopes = ids.length
    ? await tx
        .select({ userId: userEntityScopes.userId, entityId: userEntityScopes.legalEntityId })
        .from(userEntityScopes)
        .where(inArray(userEntityScopes.userId, ids))
    : [];
  const limited = new Map<string, string[]>();
  for (const s of scopes) limited.set(s.userId, [...(limited.get(s.userId) ?? []), s.entityId]);
  return managers.filter((m) => {
    const companies = limited.get(m.userId!);
    return !companies || companies.includes(legalEntityId);
  });
}

/** The competencies the workspace rates, or the defaults. */
export async function competenciesOf(tx: Tx): Promise<Competency[]> {
  const [settings] = await tx
    .select({ competencies: performanceSettings.competencies })
    .from(performanceSettings);
  return settings?.competencies.length ? settings.competencies : [...DEFAULT_COMPETENCIES];
}

export async function employeeRefs(
  tx: Tx,
  ids: (string | null)[],
): Promise<Map<string, EmployeeRef>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map();
  const rows = await tx
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      fullNameBn: employees.fullNameBn,
    })
    .from(employees)
    .where(inArray(employees.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}
