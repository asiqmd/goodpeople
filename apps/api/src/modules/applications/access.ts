import { NotFoundException } from '@nestjs/common';
import {
  applications,
  candidates,
  employees,
  interviewPanel,
  interviews,
  jobOpenings,
  legalEntities,
  type Tx,
} from '@gp/db';
import {
  DEFAULT_SCORECARD_CRITERIA,
  type ApplicationStage,
  type EmployeeRef,
  type MovableStage,
  type PipelineOpening,
} from '@gp/shared';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { employeeOfUser } from '../employees/employee.queries.js';

// Who may see and change what in recruitment. Those who manage recruitment see every opening of
// the companies they look after; an opening's hiring manager sees its applications; an
// interviewer sees only the interviews they are on. Anyone else finds nothing.

export type OpeningRow = typeof jobOpenings.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;
export type CandidateRow = typeof candidates.$inferSelect;

export const notFound = (what = 'application') =>
  new NotFoundException(`No such ${what}, or it is not yours to see`);

/** The signed-in login as recruitment sees it. */
export interface Viewer {
  userId: string;
  /** May manage recruitment, for the companies in `companies` (null: every company). */
  manage: boolean;
  companies: string[] | null;
  /** Their employee record, if any: hiring managers and interviewers are employees. */
  employeeId: string | null;
}

export async function viewerOf(tx: Tx, user: AuthUser): Promise<Viewer> {
  const [companies, me] = await Promise.all([
    entityScopeOf(tx, user.id),
    employeeOfUser(tx, user.id),
  ]);
  return {
    userId: user.id,
    manage: userCan(user, 'recruitment.manage'),
    companies,
    employeeId: me?.id ?? null,
  };
}

/** Manages this opening: the permission, and its company among those the login looks after. */
export const managesOpening = (viewer: Viewer, opening: Pick<OpeningRow, 'legalEntityId'>) =>
  viewer.manage && (!viewer.companies || viewer.companies.includes(opening.legalEntityId));

export const hiringManagerOf = (viewer: Viewer, opening: OpeningRow) =>
  !!viewer.employeeId && opening.hiringManagerEmployeeId === viewer.employeeId;

/** What the viewer may do with one application. */
export interface ApplicationAccess {
  application: ApplicationRow;
  opening: OpeningRow;
  candidate: CandidateRow;
  manage: boolean;
  hiringManager: boolean;
}

/** The application for those who manage it or hire for its opening; not found for others. */
export async function applicationFor(
  tx: Tx,
  viewer: Viewer,
  applicationId: string,
  options: { lock?: boolean } = {},
): Promise<ApplicationAccess> {
  const query = tx
    .select({ application: applications, opening: jobOpenings, candidate: candidates })
    .from(applications)
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(eq(applications.id, applicationId));
  const [row] = options.lock ? await query.for('update', { of: applications }) : await query;
  if (!row) throw notFound();
  const manage = managesOpening(viewer, row.opening);
  const hiringManager = hiringManagerOf(viewer, row.opening);
  if (!manage && !hiringManager) throw notFound();
  return { ...row, manage, hiringManager };
}

/** Whether the viewer is on the panel of an interview (not cancelled) of this application. */
export async function interviewsApplication(
  tx: Tx,
  viewer: Viewer,
  applicationId: string,
): Promise<boolean> {
  if (!viewer.employeeId) return false;
  const [row] = await tx
    .select({ id: interviewPanel.id })
    .from(interviewPanel)
    .innerJoin(interviews, eq(interviews.id, interviewPanel.interviewId))
    .where(
      and(
        eq(interviews.applicationId, applicationId),
        ne(interviews.status, 'cancelled'),
        eq(interviewPanel.employeeId, viewer.employeeId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Where the viewer may move an application from its stage: among the open stages, or out as
 * rejected or withdrawn; a rejected one back to screening only for those who manage
 * recruitment. Never to `hired`, and nothing moves a hired one.
 */
export function movesFrom(stage: ApplicationStage, manage: boolean): MovableStage[] {
  if (stage === 'hired' || stage === 'withdrawn') return [];
  if (stage === 'rejected') return manage ? ['screening'] : [];
  const open = (['applied', 'screening', 'interview', 'offer'] as const).filter((s) => s !== stage);
  return [...open, 'rejected', 'withdrawn'];
}

/** The criteria an opening's scorecards rate. */
export const criteriaOf = (opening: Pick<OpeningRow, 'scorecardCriteria'>): string[] =>
  opening.scorecardCriteria.length ? opening.scorecardCriteria : [...DEFAULT_SCORECARD_CRITERIA];

export const employeeRefSelect = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  fullName: employees.fullName,
  fullNameBn: employees.fullNameBn,
};

export async function employeeRefs(tx: Tx, ids: string[]): Promise<Map<string, EmployeeRef>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select(employeeRefSelect)
    .from(employees)
    .where(inArray(employees.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function openingView(tx: Tx, opening: OpeningRow): Promise<PipelineOpening> {
  const [entity] = await tx
    .select({ id: legalEntities.id, name: legalEntities.name })
    .from(legalEntities)
    .where(eq(legalEntities.id, opening.legalEntityId));
  const managers = await employeeRefs(
    tx,
    opening.hiringManagerEmployeeId ? [opening.hiringManagerEmployeeId] : [],
  );
  return {
    id: opening.id,
    title: opening.title,
    postTitleEn: opening.postTitleEn,
    postTitleBn: opening.postTitleBn,
    status: opening.status,
    legalEntity: entity!,
    hiringManager: opening.hiringManagerEmployeeId
      ? (managers.get(opening.hiringManagerEmployeeId) ?? null)
      : null,
    scorecardCriteria: criteriaOf(opening),
  };
}

/** The opening's title as the candidate saw it, in their language. */
export const postTitle = (opening: OpeningRow, language: 'en' | 'bn') =>
  (language === 'bn' ? (opening.postTitleBn ?? opening.postTitleEn) : opening.postTitleEn) ??
  opening.postTitleBn ??
  opening.title;
