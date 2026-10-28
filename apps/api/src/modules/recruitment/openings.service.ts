import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  applications,
  approvalSteps,
  designations,
  employees,
  grades,
  jobAssignments,
  jobOpenings,
  legalEntities,
  locations,
  orgUnits,
  type Tx,
} from '@gp/db';
import {
  openingProblem,
  postLanguageComplete,
  todayIn,
  type ApiError,
  type ApprovalItem,
  type OpeningAction,
  type OpeningDetail,
  type OpeningInput,
  type OpeningListItem,
  type OpeningListQuery,
  type OpeningPostInput,
  type OpeningUpdateInput,
  type OpeningView,
} from '@gp/shared';
import { and, asc, count, desc, eq, gt, inArray, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { userCan } from '../../common/roles.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { inScope, mustUseCompany } from '../access-scopes/employee-scope.js';
import { noticeRequested, type ApprovalSummary } from '../approvals/approval-notices.js';
import {
  cancelOpenSteps,
  createApprovalSteps,
  whose,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
  type Whose,
} from '../approvals/approval-steps.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser, inForceOn } from '../employees/employee.queries.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { retireSteps } from '../timesheets/timesheet-month.js';
import { openingActions, refusal, type OpeningActor } from './opening-rules.js';
import {
  listItemOf,
  openingViews,
  selectOpenings,
  stageCounts,
  type OpeningRow,
} from './opening-views.js';

const notFound = () => new NotFoundException('Opening not found');
const invalidReference = (what: string) =>
  badRequest('invalid_reference', `Choose ${what} from the list`);

/** The fields an opening's audit entries show. */
const audited = (o: Partial<OpeningRow>) => ({
  status: o.status,
  title: o.title,
  legalEntityId: o.legalEntityId,
  orgUnitId: o.orgUnitId,
  locationId: o.locationId,
  designationId: o.designationId,
  gradeId: o.gradeId,
  employmentType: o.employmentType,
  headcount: o.headcount,
  reason: o.reason,
  replacesEmployeeId: o.replacesEmployeeId,
  budgetMin: o.budgetMin,
  budgetMax: o.budgetMax,
  hiringManagerEmployeeId: o.hiringManagerEmployeeId,
});

/**
 * Openings: a position to fill, drafted by HR or by a line manager for their own team,
 * approved by the hiring manager's line manager and then HR, and once approved posted on the
 * careers page by HR. A login limited to some companies sees only theirs.
 */
@Injectable()
export class OpeningsService implements ApprovalSubjectHandler<OpeningView> {
  readonly auditPrefix = 'opening';
  readonly entityType = 'job_opening' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Who sees what ──────────────────────────────────────────────────────────

  /**
   * The openings a login sees: HR every one in its companies; anyone else those they drafted
   * or are the hiring manager of.
   */
  private async visible(tx: Tx, user: AuthUser): Promise<SQL | undefined> {
    const entities = await entityScopeOf(tx, user.id);
    const companies = entities ? inArray(jobOpenings.legalEntityId, entities) : undefined;
    if (userCan(user, 'recruitment.manage')) return companies;
    const me = await employeeOfUser(tx, user.id);
    return and(
      companies,
      or(
        eq(jobOpenings.createdByUserId, user.id),
        me ? eq(jobOpenings.hiringManagerEmployeeId, me.id) : undefined,
      ),
    );
  }

  /** The opening, held for a change; "not found" when the login does not see it. */
  private async lock(tx: Tx, user: AuthUser, id: string): Promise<OpeningRow> {
    const [row] = await tx
      .select()
      .from(jobOpenings)
      .where(and(eq(jobOpenings.id, id), await this.visible(tx, user)))
      .for('update');
    if (!row) throw notFound();
    return row;
  }

  private actor(user: AuthUser, row: OpeningRow): OpeningActor {
    return {
      manage: userCan(user, 'recruitment.manage'),
      creator: row.createdByUserId === user.id,
    };
  }

  private async hired(tx: Tx, openingId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(applications)
      .where(and(eq(applications.openingId, openingId), eq(applications.stage, 'hired')));
    return row?.n ?? 0;
  }

  /** Throws unless the login may take the action on the opening now. */
  private async must(tx: Tx, user: AuthUser, row: OpeningRow, action: OpeningAction) {
    const hired = action === 'cancel' ? await this.hired(tx, row.id) : 0;
    const refused = refusal(action, { ...row, hired }, this.actor(user, row), todayIn());
    if (refused) throw refused;
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  list(user: AuthUser, query: OpeningListQuery): Promise<OpeningListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await selectOpenings(
        tx,
        and(
          await this.visible(tx, user),
          query.status ? eq(jobOpenings.status, query.status) : undefined,
          query.legalEntityId ? eq(jobOpenings.legalEntityId, query.legalEntityId) : undefined,
        ),
      ).orderBy(desc(jobOpenings.createdAt));
      const counts = await stageCounts(
        tx,
        rows.map((r) => r.o.id),
      );
      return rows.map((r) => listItemOf(r, counts.get(r.o.id)!));
    });
  }

  get(user: AuthUser, id: string): Promise<OpeningDetail> {
    return this.tenantDb.run((tx) => this.detail(tx, user, id));
  }

  /**
   * The opening with what the login may do with it. Whoever decides one of its approval steps
   * reads it too, without actions.
   */
  private async detail(tx: Tx, user: AuthUser, id: string): Promise<OpeningDetail> {
    const [row] = await selectOpenings(
      tx,
      and(eq(jobOpenings.id, id), await this.visible(tx, user)),
    );
    if (row) {
      const [view] = await openingViews(tx, [row]);
      const hired = await this.hired(tx, id);
      return {
        ...view!,
        actions: openingActions({ ...row.o, hired }, this.actor(user, row.o), todayIn()),
      };
    }
    if (!(await this.approverOf(tx, user, id))) throw notFound();
    return { ...(await this.viewIn(tx, id)), actions: [] };
  }

  private async approverOf(tx: Tx, user: AuthUser, id: string): Promise<boolean> {
    const me = await employeeOfUser(tx, user.id);
    const [step] = await tx
      .select({ kind: approvalSteps.kind })
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.subjectId, id),
          eq(approvalSteps.subjectType, 'job_opening'),
          or(
            me
              ? and(eq(approvalSteps.kind, 'manager'), eq(approvalSteps.approverEmployeeId, me.id))
              : undefined,
            userCan(user, 'approvals.hr') ? eq(approvalSteps.kind, 'hr') : undefined,
          ),
        ),
      )
      .limit(1);
    if (!step) return false;
    if (step.kind !== 'hr') return true;
    const [opening] = await tx
      .select({ managerId: jobOpenings.hiringManagerEmployeeId })
      .from(jobOpenings)
      .where(eq(jobOpenings.id, id));
    return !opening?.managerId || (await inScope(tx, user, opening.managerId));
  }

  private async viewIn(tx: Tx, id: string): Promise<OpeningView> {
    const rows = await selectOpenings(tx, eq(jobOpenings.id, id));
    if (!rows.length) throw notFound();
    return (await openingViews(tx, rows))[0]!;
  }

  // ── Drafting ───────────────────────────────────────────────────────────────

  /** A line manager is someone with a direct report in a job today. */
  private async lineManager(tx: Tx, user: AuthUser) {
    const me = await employeeOfUser(tx, user.id);
    if (!me || me.status !== 'active') return null;
    const [report] = await tx
      .select({ id: jobAssignments.id })
      .from(jobAssignments)
      .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
      .where(
        and(
          eq(jobAssignments.managerId, me.id),
          inForceOn(todayIn()),
          eq(employees.status, 'active'),
        ),
      )
      .limit(1);
    return report ? me : null;
  }

  /** Whom the opening's hiring manager may be: HR names anyone, a line manager themselves. */
  private async hiringManagerFor(
    tx: Tx,
    user: AuthUser,
    wanted: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (userCan(user, 'recruitment.manage')) return wanted;
    const me = await this.lineManager(tx, user);
    if (!me) {
      throw forbidden('role_not_allowed', 'Only HR or a line manager can draft an opening');
    }
    if (wanted && wanted !== me.id) {
      throw forbidden(
        'hiring_manager_self',
        'A line manager drafts openings for their own team, as the hiring manager',
      );
    }
    return me.id;
  }

  private async checkReferences(
    tx: Tx,
    o: Pick<
      OpeningRow,
      | 'legalEntityId'
      | 'orgUnitId'
      | 'locationId'
      | 'designationId'
      | 'gradeId'
      | 'hiringManagerEmployeeId'
      | 'replacesEmployeeId'
    >,
  ) {
    const [entity] = await tx
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(and(eq(legalEntities.id, o.legalEntityId), eq(legalEntities.isActive, true)));
    if (!entity) throw badRequest('legal_entity_unknown', 'Choose one of your companies');
    if (o.orgUnitId) {
      const [unit] = await tx
        .select({ id: orgUnits.id })
        .from(orgUnits)
        .where(and(eq(orgUnits.id, o.orgUnitId), eq(orgUnits.legalEntityId, o.legalEntityId)));
      if (!unit) throw invalidReference("a unit of the opening's company");
    }
    if (o.locationId) {
      const [place] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, o.locationId), eq(locations.legalEntityId, o.legalEntityId)));
      if (!place) throw invalidReference("a location of the opening's company");
    }
    if (o.designationId) {
      const [row] = await tx
        .select({ id: designations.id })
        .from(designations)
        .where(eq(designations.id, o.designationId));
      if (!row) throw invalidReference('a designation');
    }
    if (o.gradeId) {
      const [row] = await tx.select({ id: grades.id }).from(grades).where(eq(grades.id, o.gradeId));
      if (!row) throw invalidReference('a grade');
    }
    if (o.hiringManagerEmployeeId) await this.checkHiringManager(tx, o.hiringManagerEmployeeId);
    if (o.replacesEmployeeId) {
      const [row] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, o.replacesEmployeeId));
      if (!row) throw invalidReference('the person replaced');
    }
  }

  /** The hiring manager decides on candidates, so they must be employed and sign in. */
  private async checkHiringManager(tx: Tx, employeeId: string) {
    const [row] = await tx
      .select({ status: employees.status, userId: employees.userId })
      .from(employees)
      .where(eq(employees.id, employeeId));
    if (!row || row.status !== 'active' || !row.userId) {
      throw badRequest(
        'hiring_manager_invalid',
        'The hiring manager must be an active employee with a login',
      );
    }
  }

  async create(user: AuthUser, input: OpeningInput): Promise<OpeningDetail> {
    return this.tenantDb.run(async (tx) => {
      const hiringManagerEmployeeId =
        (await this.hiringManagerFor(tx, user, input.hiringManagerEmployeeId)) ?? null;
      await mustUseCompany(tx, user, input.legalEntityId);
      const values = {
        legalEntityId: input.legalEntityId,
        orgUnitId: input.orgUnitId ?? null,
        locationId: input.locationId ?? null,
        designationId: input.designationId ?? null,
        gradeId: input.gradeId ?? null,
        title: input.title,
        employmentType: input.employmentType,
        headcount: input.headcount,
        reason: input.reason,
        replacesEmployeeId:
          input.reason === 'replacement' ? (input.replacesEmployeeId ?? null) : null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        justification: input.justification ?? null,
        hiringManagerEmployeeId,
        scorecardCriteria: input.scorecardCriteria,
      };
      await this.checkReferences(tx, values);
      const [row] = await tx
        .insert(jobOpenings)
        .values({ tenantId: currentTenantId(), ...values, createdByUserId: user.id })
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'opening.create',
        entityType: 'job_opening',
        entityId: row!.id,
        after: audited(row!),
      });
      return this.detail(tx, user, row!.id);
    });
  }

  async update(user: AuthUser, id: string, input: OpeningUpdateInput): Promise<OpeningDetail> {
    return this.tenantDb.run(async (tx) => {
      const before = await this.lock(tx, user, id);
      await this.must(tx, user, before, 'edit');
      const defined = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined),
      ) as OpeningUpdateInput;
      const merged = { ...before, ...defined };
      if (merged.reason !== 'replacement') merged.replacesEmployeeId = null;
      if (input.hiringManagerEmployeeId !== undefined) {
        merged.hiringManagerEmployeeId =
          (await this.hiringManagerFor(tx, user, input.hiringManagerEmployeeId)) ?? null;
      }
      const problem = openingProblem(merged);
      if (problem) {
        const body: ApiError = {
          statusCode: 400,
          error: 'Bad Request',
          message: problem.message,
          code: 'validation_failed',
          issues: [problem],
        };
        throw new BadRequestException(body);
      }
      if (merged.legalEntityId !== before.legalEntityId) {
        await mustUseCompany(tx, user, merged.legalEntityId);
      }
      await this.checkReferences(tx, merged);
      const [after] = await tx
        .update(jobOpenings)
        .set({
          legalEntityId: merged.legalEntityId,
          orgUnitId: merged.orgUnitId,
          locationId: merged.locationId,
          designationId: merged.designationId,
          gradeId: merged.gradeId,
          title: merged.title,
          employmentType: merged.employmentType,
          headcount: merged.headcount,
          reason: merged.reason,
          replacesEmployeeId: merged.replacesEmployeeId,
          budgetMin: merged.budgetMin,
          budgetMax: merged.budgetMax,
          justification: merged.justification,
          hiringManagerEmployeeId: merged.hiringManagerEmployeeId,
          scorecardCriteria: merged.scorecardCriteria,
          updatedAt: new Date(),
        })
        .where(eq(jobOpenings.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'opening.update',
        entityType: 'job_opening',
        entityId: id,
        before: audited(before),
        after: audited(after!),
      });
      return this.detail(tx, user, id);
    });
  }

  /** To the hiring manager's line manager and then HR, as leave is approved. */
  async submit(user: AuthUser, id: string): Promise<OpeningDetail> {
    return this.tenantDb.run(async (tx) => {
      const row = await this.lock(tx, user, id);
      await this.must(tx, user, row, 'submit');
      if (!row.hiringManagerEmployeeId) {
        throw badRequest('hiring_manager_required', 'Choose the hiring manager before submitting');
      }
      await this.checkHiringManager(tx, row.hiringManagerEmployeeId);
      await retireSteps(tx, id);
      await tx
        .update(jobOpenings)
        .set({ status: 'pending_approval', updatedAt: new Date() })
        .where(eq(jobOpenings.id, id));
      await createApprovalSteps(tx, {
        tenantId: row.tenantId,
        type: 'job_opening',
        id,
        employeeId: row.hiringManagerEmployeeId,
        onDate: todayIn(),
        chain: ['manager', 'hr'],
      });
      await this.skipMakersStep(tx, id, row.createdByUserId);
      await noticeRequested(
        tx,
        this.notifications,
        { type: 'job_opening', id },
        await this.summarize(tx, id),
      );
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'opening.submit',
        entityType: 'job_opening',
        entityId: id,
        before: { status: row.status },
        after: { status: 'pending_approval' },
      });
      return this.detail(tx, user, id);
    });
  }

  /**
   * HR drafting an opening for one of their own reports would be its line manager's approver
   * and could not decide it; their draft stands for that step, and HR still decides.
   */
  private async skipMakersStep(tx: Tx, id: string, makerUserId: string | null) {
    const maker = makerUserId ? await employeeOfUser(tx, makerUserId) : null;
    if (!maker) return;
    const [step] = await tx
      .update(approvalSteps)
      .set({ status: 'skipped' })
      .where(
        and(
          eq(approvalSteps.subjectId, id),
          eq(approvalSteps.kind, 'manager'),
          eq(approvalSteps.approverEmployeeId, maker.id),
          inArray(approvalSteps.status, ['pending', 'waiting']),
        ),
      )
      .returning();
    if (step?.status !== 'skipped') return;
    const [next] = await tx
      .select({ id: approvalSteps.id })
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.subjectId, id),
          eq(approvalSteps.status, 'waiting'),
          gt(approvalSteps.stepNo, step.stepNo),
        ),
      )
      .orderBy(asc(approvalSteps.stepNo))
      .limit(1);
    if (next) {
      await tx
        .update(approvalSteps)
        .set({ status: 'pending' })
        .where(eq(approvalSteps.id, next.id));
    }
  }

  // ── The job post ───────────────────────────────────────────────────────────

  async savePost(user: AuthUser, id: string, input: OpeningPostInput): Promise<OpeningDetail> {
    return this.tenantDb.run(async (tx) => {
      const row = await this.lock(tx, user, id);
      await this.must(tx, user, row, 'post');
      if (input.closesOn < todayIn()) {
        throw badRequest('closes_on_past', 'The closing date must be today or later');
      }
      const post = {
        postTitleEn: input.postTitleEn ?? null,
        postTitleBn: input.postTitleBn ?? null,
        descriptionEn: input.descriptionEn ?? null,
        descriptionBn: input.descriptionBn ?? null,
        showSalary: input.showSalary,
        closesOn: input.closesOn,
      };
      await tx
        .update(jobOpenings)
        .set({ ...post, updatedAt: new Date() })
        .where(eq(jobOpenings.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'opening.post',
        entityType: 'job_opening',
        entityId: id,
        before: {
          postTitleEn: row.postTitleEn,
          postTitleBn: row.postTitleBn,
          showSalary: row.showSalary,
          closesOn: row.closesOn,
        },
        after: {
          postTitleEn: post.postTitleEn,
          postTitleBn: post.postTitleBn,
          showSalary: post.showSalary,
          closesOn: post.closesOn,
        },
      });
      return this.detail(tx, user, id);
    });
  }

  /** On the careers page from now until its closing date. */
  publish(user: AuthUser, id: string): Promise<OpeningDetail> {
    return this.move(user, id, 'publish', (row) => {
      const complete =
        postLanguageComplete(row.postTitleEn, row.descriptionEn) ||
        postLanguageComplete(row.postTitleBn, row.descriptionBn);
      if (!complete || !row.closesOn) {
        throw badRequest(
          'post_incomplete',
          'Write the job post (a title and a description) and its closing date first',
        );
      }
      if (row.closesOn < todayIn()) {
        throw badRequest('closes_on_past', 'The closing date must be today or later');
      }
      return { status: 'open', publishedAt: new Date(), closedAt: null };
    });
  }

  close(user: AuthUser, id: string): Promise<OpeningDetail> {
    return this.move(user, id, 'close', () => ({ status: 'closed', closedAt: new Date() }));
  }

  /** Back on the careers page, until its closing date. */
  reopen(user: AuthUser, id: string): Promise<OpeningDetail> {
    return this.move(user, id, 'reopen', () => ({ status: 'open', closedAt: null }));
  }

  /** Withdrawn before anyone is hired; an approval still open is cancelled with it. */
  cancel(user: AuthUser, id: string): Promise<OpeningDetail> {
    return this.move(user, id, 'cancel', (row) => ({
      status: 'cancelled',
      closedAt: row.closedAt ?? new Date(),
    }));
  }

  private move(
    user: AuthUser,
    id: string,
    action: Exclude<OpeningAction, 'edit' | 'submit' | 'post'>,
    change: (row: OpeningRow) => Partial<typeof jobOpenings.$inferInsert>,
  ): Promise<OpeningDetail> {
    return this.tenantDb.run(async (tx) => {
      const row = await this.lock(tx, user, id);
      await this.must(tx, user, row, action);
      const set = change(row);
      if (action === 'cancel') await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await tx
        .update(jobOpenings)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(jobOpenings.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: `opening.${action}`,
        entityType: 'job_opening',
        entityId: id,
        before: { status: row.status },
        after: { status: set.status },
      });
      return this.detail(tx, user, id);
    });
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  view(subjectId: string): Promise<OpeningView> {
    return this.tenantDb.run((tx) => this.viewIn(tx, subjectId));
  }

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ o: jobOpenings, company: legalEntities.name, manager: employees.fullName })
      .from(jobOpenings)
      .innerJoin(legalEntities, eq(legalEntities.id, jobOpenings.legalEntityId))
      .leftJoin(employees, eq(employees.id, jobOpenings.hiringManagerEmployeeId))
      .where(eq(jobOpenings.id, subjectId));
    const o = row!.o;
    const n = o.headcount;
    const bnCount = new Intl.NumberFormat('bn-BD').format(n);
    return {
      employeeId: o.hiringManagerEmployeeId ?? '',
      personName: row!.manager ?? '',
      summary: {
        en: `Job opening: ${o.title}, ${row!.company} (${n} position${n === 1 ? '' : 's'})`,
        bn: `নিয়োগের পদ: ${o.title}, ${row!.company} (${bnCount}টি পদ)`,
      },
      link: `/workspace/recruitment/openings/${o.id}`,
      madeBy: o.createdByUserId,
      decisionRecipients: [
        ...(o.hiringManagerEmployeeId ? [{ employeeId: o.hiringManagerEmployeeId }] : []),
        ...(o.createdByUserId ? [{ userId: o.createdByUserId }] : []),
      ],
    };
  }

  /** The hiring manager's request, which whoever drafted it may not approve. */
  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({
        employeeId: jobOpenings.hiringManagerEmployeeId,
        madeBy: jobOpenings.createdByUserId,
      })
      .from(jobOpenings)
      .where(eq(jobOpenings.id, subjectId))
      .for('update');
    // An opening is submitted only with a hiring manager, and keeps them while pending.
    return row?.employeeId ? { employeeId: row.employeeId, madeBy: row.madeBy } : null;
  }

  ownedBy(tx: Tx, who: Whose): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: jobOpenings.id })
        .from(jobOpenings)
        .where(whose(jobOpenings.hiringManagerEmployeeId, who)),
    );
  }

  madeBy(tx: Tx, userId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: jobOpenings.id })
        .from(jobOpenings)
        .where(eq(jobOpenings.createdByUserId, userId)),
    );
  }

  /** Approved may be posted; rejected goes back to a draft to change and submit again. */
  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected'): Promise<void> {
    await tx
      .update(jobOpenings)
      .set({ status: outcome, updatedAt: new Date() })
      .where(eq(jobOpenings.id, subjectId));
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const rows = await selectOpenings(
      tx,
      inArray(
        jobOpenings.id,
        steps.map((s) => s.subjectId),
      ),
    );
    const views = await openingViews(tx, rows);
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const opening = views.find((v) => v.id === step.subjectId);
      if (!opening) continue;
      items.push({
        sortKey: opening.updatedAt,
        item: { subjectType: 'job_opening', stepId: step.id, kind: step.kind, opening },
      });
    }
    return items;
  }
}
