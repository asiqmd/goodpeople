import { Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalSteps,
  designations,
  employeeAllocations,
  employees,
  jobAssignments,
  legalEntities,
  timesheetEntries,
  timesheets,
  type Tx,
} from '@gp/db';
import { bdForeignDonationsOn } from '@gp/country-packs';
import {
  formatAddress,
  monthBounds,
  todayIn,
  type ApprovalItem,
  type TimesheetEntriesInput,
  type TimesheetEntriesResult,
  type TimesheetEntryOutcome,
  type TimesheetEntryProblemCode,
  type TimesheetEntryRefusal,
  type TimesheetListRow,
  type TimesheetListView,
  type TimesheetPrefillResult,
  type TimesheetProjectRef,
  type TimesheetSubmitInput,
  type TimesheetSummary,
  type TimesheetView,
} from '@gp/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sum, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { userCan } from '../../common/roles.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import type { ApprovalSummary } from '../approvals/approval-notices.js';
import { noticeRequested } from '../approvals/approval-notices.js';
import {
  cancelOpenSteps,
  createApprovalSteps,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
  whose,
  type Whose,
} from '../approvals/approval-steps.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { PdfService } from '../letters/pdf.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { lockedPeriods } from '../production/production.queries.js';
import { centi, hoursText, splitHours } from './timesheet-hours.js';
import {
  allocationsIn,
  cellKey,
  chargeProblem,
  editable,
  monthContext,
  monthName,
  monthOf,
  plannedIn,
  projectRef,
  projectsByIds,
  retireSteps,
  totalsOf,
  viewOf,
  type EmployeeRow,
  type MonthContext,
  type TimesheetRow,
} from './timesheet-month.js';
import { timesheetHtml } from './timesheet-pdf.js';

/** The most hours in a day, as hundredths. */
const DAY_LIMIT = 2400;

const PROBLEM_MESSAGES: Record<
  TimesheetEntryProblemCode,
  (e: { date: string; month: string }) => string
> = {
  date_outside_month: (e) => `${e.date} is not in ${e.month}`,
  project_unknown: () => 'No such project',
  project_inactive: () => 'This project is closed',
  project_other_company: () => 'This project belongs to another company',
  project_outside_period: (e) => `The project does not run on ${e.date}`,
  day_over_24_hours: (e) => `${e.date} would have more than 24 hours`,
  client_id_taken: () => 'This entry belongs to someone else',
};

const locked = () =>
  conflict('timesheet_locked', 'This timesheet is submitted or approved and cannot change');

/**
 * Monthly project timesheets: each person enters the hours they worked on each project (from
 * the web, or offline in the app), certifies them and submits them to their line manager.
 * An approved timesheet is the basis of the month's salary split across projects.
 */
@Injectable()
export class TimesheetsService implements ApprovalSubjectHandler<TimesheetView> {
  readonly auditPrefix = 'timesheet';
  readonly entityType = 'timesheet' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly calendars: WorkCalendarService,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    private readonly pdf: PdfService,
  ) {}

  /** The signed-in employee, held so their writes go one at a time. */
  private async lockMe(tx: Tx, user: AuthUser): Promise<EmployeeRow> {
    const me = await employeeOfUser(tx, user.id);
    if (!me) throw new NotFoundException('No employee record is linked to your login');
    await tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, me.id))
      .for('update');
    return me;
  }

  private async createSheet(tx: Tx, employeeId: string, start: string): Promise<string> {
    const [row] = await tx
      .insert(timesheets)
      .values({ tenantId: currentTenantId(), employeeId, month: start })
      .returning({ id: timesheets.id });
    return row!.id;
  }

  // ── The employee's own month ───────────────────────────────────────────────

  /** The month's timesheet, or an empty draft when nothing is saved yet. */
  mine(user: AuthUser, month: string): Promise<TimesheetView> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return viewOf(tx, await monthContext(tx, this.calendars, me, month));
    });
  }

  /**
   * Saves entries in order, each on its own: one that cannot be saved is reported with its
   * reason and the rest still are, as the app's offline queue needs. An entry whose client id
   * was seen before changes nothing; zero hours removes the cell.
   */
  async saveEntries(user: AuthUser, input: TimesheetEntriesInput): Promise<TimesheetEntriesResult> {
    const outcome = await this.tenantDb.run(async (tx) => {
      const me = await this.lockMe(tx, user);
      const ctx = await monthContext(tx, this.calendars, me, input.month);
      if (ctx.timesheet && !editable(ctx.timesheet.status)) throw locked();

      const cells = new Map(ctx.entries.map((e) => [cellKey(e.date, e.projectId), e]));
      const dayTotals = new Map<string, number>();
      for (const e of ctx.entries) {
        dayTotals.set(e.date, (dayTotals.get(e.date) ?? 0) + centi(e.hours));
      }
      const clientIds = input.entries.flatMap((e) => (e.clientId ? [e.clientId] : []));
      const seen = new Map(
        clientIds.length
          ? (
              await tx
                .select({
                  clientId: timesheetEntries.clientId,
                  employeeId: timesheetEntries.employeeId,
                })
                .from(timesheetEntries)
                .where(inArray(timesheetEntries.clientId, clientIds))
            ).map((r) => [r.clientId!, r.employeeId])
          : [],
      );
      const others = input.entries.flatMap((e) =>
        e.projectId && !ctx.projects.has(e.projectId) ? [e.projectId] : [],
      );
      for (const [id, row] of await projectsByIds(tx, [...new Set(others)])) {
        ctx.projects.set(id, row);
      }

      let timesheetId = ctx.timesheet?.id;
      const accepted: TimesheetEntryOutcome[] = [];
      const refused: TimesheetEntryRefusal[] = [];
      for (const e of input.entries) {
        const hundredths = centi(e.hours);
        const base = {
          clientId: e.clientId ?? null,
          date: e.date,
          projectId: e.projectId,
          hours: hoursText(hundredths),
        };
        const refuse = (code: TimesheetEntryProblemCode) =>
          refused.push({
            ...base,
            code,
            message: PROBLEM_MESSAGES[code]({ ...e, month: input.month }),
          });
        if (e.clientId && seen.has(e.clientId)) {
          if (seen.get(e.clientId) === me.id) accepted.push({ ...base, outcome: 'duplicate' });
          else refuse('client_id_taken');
          continue;
        }
        if (e.date < ctx.start || e.date > ctx.end) {
          refuse('date_outside_month');
          continue;
        }
        const key = cellKey(e.date, e.projectId);
        const existing = cells.get(key);
        const dayWithout = (dayTotals.get(e.date) ?? 0) - (existing ? centi(existing.hours) : 0);
        if (hundredths === 0) {
          if (existing) {
            await tx.delete(timesheetEntries).where(eq(timesheetEntries.id, existing.id));
            cells.delete(key);
            dayTotals.set(e.date, dayWithout);
          }
          accepted.push({ ...base, outcome: 'removed' });
          continue;
        }
        const problem = e.projectId
          ? chargeProblem(ctx, ctx.projects.get(e.projectId), e.date)
          : null;
        if (problem) {
          refuse(problem);
          continue;
        }
        if (dayWithout + hundredths > DAY_LIMIT) {
          refuse('day_over_24_hours');
          continue;
        }
        timesheetId ??= await this.createSheet(tx, me.id, ctx.start);
        const values = {
          hours: hoursText(hundredths),
          ...(e.note !== undefined ? { note: e.note } : {}),
          ...(e.clientId ? { clientId: e.clientId } : {}),
        };
        const [row] = existing
          ? await tx
              .update(timesheetEntries)
              .set({ ...values, updatedAt: new Date() })
              .where(eq(timesheetEntries.id, existing.id))
              .returning()
          : await tx
              .insert(timesheetEntries)
              .values({
                tenantId: currentTenantId(),
                timesheetId,
                employeeId: me.id,
                date: e.date,
                projectId: e.projectId,
                ...values,
              })
              .returning();
        cells.set(key, row!);
        dayTotals.set(e.date, dayWithout + hundredths);
        if (e.clientId) seen.set(e.clientId, me.id);
        accepted.push({ ...base, outcome: 'saved' });
      }
      if (timesheetId && accepted.some((a) => a.outcome !== 'duplicate')) {
        await tx
          .update(timesheets)
          .set({ updatedAt: new Date() })
          .where(eq(timesheets.id, timesheetId));
      }
      return { accepted, refused };
    });
    return { ...outcome, timesheet: await this.mine(user, input.month) };
  }

  /**
   * Fills days that have attendance and no entries yet: the hours worked split across the
   * person's allocated projects by their planned shares, the rest not charged to a project.
   * Leave and off days are left empty.
   */
  async prefill(user: AuthUser, month: string): Promise<TimesheetPrefillResult> {
    const days = await this.tenantDb.run(async (tx) => {
      const me = await this.lockMe(tx, user);
      const ctx = await monthContext(tx, this.calendars, me, month);
      if (ctx.timesheet && !editable(ctx.timesheet.status)) throw locked();
      const entered = new Set(ctx.entries.map((e) => e.date));
      let timesheetId = ctx.timesheet?.id;
      let filled = 0;
      for (const day of ctx.days) {
        if (!day.workedHours || day.offDay || day.leave || entered.has(day.date)) continue;
        const shares = [...plannedIn(ctx.allocations, day.date, day.date)]
          .filter(([id]) => chargeProblem(ctx, ctx.projects.get(id), day.date) === null)
          .map(([projectId, share]) => ({ projectId, percent: share.percent }));
        const parts = splitHours(Math.min(centi(day.workedHours), DAY_LIMIT), shares);
        timesheetId ??= await this.createSheet(tx, me.id, ctx.start);
        await tx.insert(timesheetEntries).values(
          parts.map((p) => ({
            tenantId: currentTenantId(),
            timesheetId: timesheetId!,
            employeeId: me.id,
            date: day.date,
            projectId: p.projectId,
            hours: hoursText(p.hundredths),
          })),
        );
        filled++;
      }
      return filled;
    });
    return { days, timesheet: await this.mine(user, month) };
  }

  /**
   * The employee certifies the hours are the work they actually did and sends the month to
   * their line manager (HR when there is none who can sign in).
   */
  async submit(user: AuthUser, input: TimesheetSubmitInput): Promise<TimesheetView> {
    await this.tenantDb.run(async (tx) => {
      const me = await this.lockMe(tx, user);
      const { start } = monthBounds(input.month);
      const today = todayIn();
      if (start > today) {
        throw badRequest('month_not_started', 'A month can be submitted once it has started');
      }
      const [row] = await tx
        .select()
        .from(timesheets)
        .where(and(eq(timesheets.employeeId, me.id), eq(timesheets.month, start)))
        .for('update');
      const [total] = row
        ? await tx
            .select({ hours: sum(timesheetEntries.hours) })
            .from(timesheetEntries)
            .where(eq(timesheetEntries.timesheetId, row.id))
        : [];
      if (!row || !Number(total?.hours)) {
        throw badRequest('timesheet_empty', 'Enter your hours before submitting');
      }
      if (!editable(row.status)) throw locked();
      await notInLockedPay(tx, me.id, start);
      await retireSteps(tx, row.id);
      await tx
        .update(timesheets)
        .set({
          status: 'submitted',
          submittedAt: new Date(),
          decidedAt: null,
          decidedByEmployeeId: null,
          updatedAt: new Date(),
        })
        .where(eq(timesheets.id, row.id));
      const someoneDecides = await createApprovalSteps(tx, {
        tenantId: row.tenantId,
        type: 'timesheet',
        id: row.id,
        employeeId: me.id,
        onDate: today,
        chain: ['manager'],
      });
      if (!someoneDecides) await this.finalize(tx, row.id, 'approved', user.id);
      else {
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'timesheet', id: row.id },
          await this.summarize(tx, row.id),
        );
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'timesheet.submit',
        entityType: 'timesheet',
        entityId: row.id,
        after: { month: input.month, hours: total!.hours, declaration: true },
      });
    });
    return this.mine(user, input.month);
  }

  // ── HR ─────────────────────────────────────────────────────────────────────

  /**
   * Back to a draft the employee can change and submit again, for example after a mistake
   * found once approved. Not once the month's pay is locked: the split is settled then.
   */
  async reopen(user: AuthUser, id: string, reason: string): Promise<TimesheetView> {
    await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(timesheets)
        .where(and(eq(timesheets.id, id), await entityScope(tx, user, timesheets.employeeId)))
        .for('update');
      if (!row) throw new NotFoundException('Timesheet not found');
      if (row.status === 'draft') throw conflict('timesheet_draft', 'This timesheet is a draft');
      await notInLockedPay(tx, row.employeeId, row.month);
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await tx
        .update(timesheets)
        .set({
          status: 'draft',
          submittedAt: null,
          decidedAt: null,
          decidedByEmployeeId: null,
          note: reason,
          updatedAt: new Date(),
        })
        .where(eq(timesheets.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'timesheet.reopen',
        entityType: 'timesheet',
        entityId: id,
        before: { status: row.status },
        after: { status: 'draft', reason },
      });
    });
    return this.view(id);
  }

  /** Everyone who needs a timesheet for the month (an allocation overlaps it) or has one. */
  list(user: AuthUser, month: string): Promise<TimesheetListView> {
    return this.tenantDb.run(async (tx) => {
      const { start, end } = monthBounds(month);
      const scope = await entityScope(tx, user, employees.id);
      const sheets = await tx
        .select({ t: timesheets })
        .from(timesheets)
        .innerJoin(employees, eq(employees.id, timesheets.employeeId))
        .where(and(eq(timesheets.month, start), scope));
      const allocated = await tx
        .selectDistinct({ id: employees.id })
        .from(employees)
        .where(
          and(
            inArray(
              employees.id,
              tx
                .select({ id: employeeAllocations.employeeId })
                .from(employeeAllocations)
                .where(
                  and(
                    lte(employeeAllocations.fromOn, end),
                    or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, start)),
                  ),
                ),
            ),
            scope,
          ),
        );
      const ids = [
        ...new Set([...sheets.map((s) => s.t.employeeId), ...allocated.map((a) => a.id)]),
      ];
      const people = ids.length
        ? await tx
            .select()
            .from(employees)
            .where(inArray(employees.id, ids))
            .orderBy(asc(employees.employeeCode))
        : [];
      const summaries = await this.summaries(
        tx,
        sheets.map((s) => s.t),
        ids,
        start,
        end,
      );
      const rows: TimesheetListRow[] = people.map((p) => {
        const sheet = sheets.find((s) => s.t.employeeId === p.id)?.t;
        const totals = summaries.totals.get(p.id)!;
        return {
          id: sheet?.id ?? null,
          employee: employeeRef(p),
          month,
          status: sheet?.status ?? null,
          needed: summaries.needed.has(p.id),
          submittedAt: sheet?.submittedAt?.toISOString() ?? null,
          decidedAt: sheet?.decidedAt?.toISOString() ?? null,
          ...totals,
        };
      });
      const projects = new Map<string, TimesheetProjectRef>();
      for (const row of rows) {
        for (const t of row.totals) if (t.project) projects.set(t.project.id, t.project);
      }
      return {
        month,
        projects: [...projects.values()].toSorted((a, b) => a.code.localeCompare(b.code)),
        rows,
      };
    });
  }

  /**
   * Hours by project for these people in one month, with their planned shares; `needed`
   * holds those with an allocation overlapping it.
   */
  private async summaries(
    tx: Tx,
    sheets: TimesheetRow[],
    employeeIds: string[],
    start: string,
    end: string,
  ) {
    const sums = sheets.length
      ? await tx
          .select({
            timesheetId: timesheetEntries.timesheetId,
            projectId: timesheetEntries.projectId,
            hours: sum(timesheetEntries.hours),
          })
          .from(timesheetEntries)
          .where(
            inArray(
              timesheetEntries.timesheetId,
              sheets.map((s) => s.id),
            ),
          )
          .groupBy(timesheetEntries.timesheetId, timesheetEntries.projectId)
      : [];
    const allocations = await allocationsIn(tx, employeeIds, start, end);
    const projectIds = [
      ...new Set([
        ...allocations.map((a) => a.projectId),
        ...sums.flatMap((s) => (s.projectId ? [s.projectId] : [])),
      ]),
    ];
    const refs = new Map(
      [...(await projectsByIds(tx, projectIds))].map(([id, p]) => [id, projectRef(p)]),
    );
    const totals = new Map<string, ReturnType<typeof totalsOf>>();
    for (const employeeId of employeeIds) {
      const sheet = sheets.find((s) => s.employeeId === employeeId);
      totals.set(
        employeeId,
        totalsOf(
          sums
            .filter((s) => s.timesheetId === sheet?.id)
            .map((s) => ({ projectId: s.projectId, hundredths: centi(s.hours ?? 0) })),
          plannedIn(
            allocations.filter((a) => a.employeeId === employeeId),
            start,
            end,
          ),
          refs,
        ),
      );
    }
    return { totals, needed: new Set(allocations.map((a) => a.employeeId)) };
  }

  /** Whether the user may read a timesheet: its owner, an approver of it, or HR in scope. */
  private async readable(tx: Tx, user: AuthUser, id: string): Promise<TimesheetRow> {
    const [row] = await tx.select().from(timesheets).where(eq(timesheets.id, id));
    if (!row) throw new NotFoundException('Timesheet not found');
    const me = await employeeOfUser(tx, user.id);
    if (me?.id === row.employeeId) return row;
    if (userCan(user, 'projects.manage')) {
      const scope = await entityScope(tx, user, timesheets.employeeId);
      if (!scope) return row;
      const [inScope] = await tx
        .select({ id: timesheets.id })
        .from(timesheets)
        .where(and(eq(timesheets.id, id), scope));
      if (inScope) return row;
    }
    const approver: SQL[] = [];
    if (me) {
      approver.push(
        and(eq(approvalSteps.kind, 'manager'), eq(approvalSteps.approverEmployeeId, me.id))!,
      );
    }
    if (userCan(user, 'approvals.hr')) approver.push(eq(approvalSteps.kind, 'hr'));
    if (approver.length) {
      const [step] = await tx
        .select({ id: approvalSteps.id })
        .from(approvalSteps)
        .where(and(eq(approvalSteps.subjectId, id), or(...approver)))
        .limit(1);
      if (step) return row;
    }
    throw new NotFoundException('Timesheet not found');
  }

  private async contextOf(tx: Tx, row: TimesheetRow): Promise<MonthContext> {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, row.employeeId));
    return monthContext(tx, this.calendars, employee!, monthOf(row.month));
  }

  get(user: AuthUser, id: string): Promise<TimesheetView> {
    return this.tenantDb.run(async (tx) =>
      viewOf(tx, await this.contextOf(tx, await this.readable(tx, user, id))),
    );
  }

  /** The month as the timesheet donors ask for, in English or Bangla. */
  async file(user: AuthUser, id: string, language: 'en' | 'bn') {
    const { html, name } = await this.tenantDb.run(async (tx) => {
      const ctx = await this.contextOf(tx, await this.readable(tx, user, id));
      const sheet = await viewOf(tx, ctx);
      const bn = language === 'bn';
      const [job] = await tx
        .select({
          entity: legalEntities,
          designation: designations.name,
          designationBn: designations.nameBn,
        })
        .from(jobAssignments)
        .innerJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
        .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
        .where(
          and(
            eq(jobAssignments.employeeId, ctx.employee.id),
            lte(jobAssignments.effectiveFrom, ctx.end),
          ),
        )
        .orderBy(desc(jobAssignments.effectiveFrom))
        .limit(1);
      const [decider] = ctx.timesheet?.decidedByEmployeeId
        ? await tx
            .select({ fullName: employees.fullName, fullNameBn: employees.fullNameBn })
            .from(employees)
            .where(eq(employees.id, ctx.timesheet.decidedByEmployeeId))
        : [];
      const nameOf = (p: { fullName: string; fullNameBn: string | null }) =>
        bn && p.fullNameBn ? p.fullNameBn : p.fullName;
      return {
        name: `timesheet-${ctx.employee.employeeCode}-${ctx.month}-${language}.pdf`,
        html: timesheetHtml({
          language,
          company: {
            name: job?.entity.legalName ?? job?.entity.name ?? '',
            details: job?.entity.address ? formatAddress(job.entity.address, language) : '',
          },
          employee: {
            code: ctx.employee.employeeCode,
            name: nameOf(ctx.employee),
            designation: (bn ? job?.designationBn : null) ?? job?.designation ?? null,
          },
          sheet,
          decidedBy: decider ? nameOf(decider) : null,
          grants: new Map(
            [...ctx.projects].map(([projectId, p]) => [
              projectId,
              {
                donor: p.donor?.name ?? null,
                grantReference: p.grantReference,
                fd6: p.fd6ApprovalNo,
              },
            ]),
          ),
          rules: bdForeignDonationsOn(ctx.end),
        }),
      };
    });
    return { bytes: await this.pdf.render(html), fileName: name };
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  view(subjectId: string): Promise<TimesheetView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx.select().from(timesheets).where(eq(timesheets.id, subjectId));
      if (!row) throw new NotFoundException('Timesheet not found');
      return viewOf(tx, await this.contextOf(tx, row));
    });
  }

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ t: timesheets, name: employees.fullName })
      .from(timesheets)
      .innerJoin(employees, eq(employees.id, timesheets.employeeId))
      .where(eq(timesheets.id, subjectId));
    const [total] = await tx
      .select({ hours: sum(timesheetEntries.hours) })
      .from(timesheetEntries)
      .where(eq(timesheetEntries.timesheetId, subjectId));
    const month = monthOf(row!.t.month);
    const name = monthName(month);
    const hours = Number(total?.hours ?? 0);
    const bnHours = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 2 }).format(hours);
    return {
      employeeId: row!.t.employeeId,
      personName: row!.name,
      summary: {
        en: `Timesheet for ${name.en} (${hours} hours)`,
        bn: `${name.bn}-এর টাইমশিট (${bnHours} ঘণ্টা)`,
      },
      link: `/workspace/timesheets?month=${month}`,
    };
  }

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ employeeId: timesheets.employeeId })
      .from(timesheets)
      .where(eq(timesheets.id, subjectId))
      .for('update');
    return row ?? null;
  }

  ownedBy(tx: Tx, who: Whose): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx.select({ id: timesheets.id }).from(timesheets).where(whose(timesheets.employeeId, who)),
    );
  }

  /** Rejected goes back to the employee to correct; approved fixes the month's split. */
  async finalize(
    tx: Tx,
    subjectId: string,
    outcome: 'approved' | 'rejected',
    actorUserId: string,
  ): Promise<void> {
    const decider = await employeeOfUser(tx, actorUserId);
    if (outcome === 'approved') {
      const [row] = await tx.select().from(timesheets).where(eq(timesheets.id, subjectId));
      await notInLockedPay(tx, row!.employeeId, row!.month);
    }
    await tx
      .update(timesheets)
      .set({
        status: outcome,
        decidedAt: new Date(),
        decidedByEmployeeId: decider?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(timesheets.id, subjectId));
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const rows = await tx
      .select({ t: timesheets, employee: employees })
      .from(timesheets)
      .innerJoin(employees, eq(employees.id, timesheets.employeeId))
      .where(
        inArray(
          timesheets.id,
          steps.map((s) => s.subjectId),
        ),
      );
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    // Grouped by month, since shares are planned per month.
    for (const month of new Set(rows.map((r) => r.t.month))) {
      const ofMonth = rows.filter((r) => r.t.month === month);
      const { start, end } = monthBounds(monthOf(month));
      const { totals } = await this.summaries(
        tx,
        ofMonth.map((r) => r.t),
        ofMonth.map((r) => r.t.employeeId),
        start,
        end,
      );
      for (const { t, employee } of ofMonth) {
        const timesheet: TimesheetSummary = {
          id: t.id,
          employee: employeeRef(employee),
          month: monthOf(t.month),
          status: t.status,
          submittedAt: t.submittedAt?.toISOString() ?? null,
          decidedAt: t.decidedAt?.toISOString() ?? null,
          ...totals.get(t.employeeId)!,
        };
        for (const step of steps.filter((s) => s.subjectId === t.id)) {
          items.push({
            sortKey: timesheet.submittedAt ?? t.month,
            item: { subjectType: 'timesheet', stepId: step.id, kind: step.kind, timesheet },
          });
        }
      }
    }
    return items;
  }
}

/**
 * Once a month's pay is locked, the journal has charged it to projects by the shares then in
 * force, so its timesheet can no longer be submitted, approved or reopened.
 */
async function notInLockedPay(tx: Tx, employeeId: string, month: string) {
  const { start, end } = monthBounds(monthOf(month));
  if ((await lockedPeriods(tx, [employeeId], start, end)).size) {
    throw conflict(
      'timesheet_month_locked',
      'Pay for this month is locked in payroll, so its timesheet cannot change',
    );
  }
}
