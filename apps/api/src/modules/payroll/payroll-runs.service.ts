import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalSteps,
  CIPHER_FIELDS,
  employees,
  payGroups,
  payrollInputs,
  payrollRunItems,
  payrollRuns,
  pfMembers,
  separations,
  tenantAuditLog,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  fiscalYearOf,
  formatAddress,
  monthBounds,
  money,
  todayIn,
  type AdjustmentCreateInput,
  type ApprovalItem,
  type BonusRule,
  type BonusRunInput,
  type PayLineView,
  type PayrollRunItemPage,
  type PayrollRunItemView,
  type PayrollRunView,
  type PayslipSummary,
  type RunCreateInput,
  type RunInputInput,
  type RunItemsQuery,
  type RunProblemCode,
  type RunTaxWorking,
  type SettlementWorking,
  type RunTotals,
  type RunVariables,
  type TenantWithAccess,
} from '@gp/shared';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { noticeRequested, type ApprovalSummary } from '../approvals/approval-notices.js';
import {
  cancelOpenSteps,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
} from '../approvals/approval-steps.js';
import { loadSteps } from '../approvals/approval-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { PRIMARY_ACCOUNT_CHANGED } from '../employees/employees.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { PolicyService } from '../group/policy.service.js';
import { PdfService } from '../letters/pdf.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { componentsOf, payrollSettingsOf } from './payroll-setup.service.js';
import {
  computeBonus,
  computePay,
  difference,
  employment,
  type EngineResult,
} from './run-engine.js';
import { amountText, payslipHtml, periodName } from './payslip.js';
import { endMembership } from './provident-fund.service.js';
import { SettlementsService } from './settlements.service.js';
import { WppfService } from './wppf.service.js';
import {
  approvedPay,
  attendanceOf,
  extraVariablesOf,
  inputsOf,
  jobsOn,
  loansFor,
  pfRatesFor,
  postLockedRun,
  taxContextsFor,
  workingDaysAfter,
} from './run-context.js';

type RunRow = typeof payrollRuns.$inferSelect;

/** What a run item keeps, encrypted. Items from before M3 have no taxable, tax or loans. */
interface ItemResult {
  lines: PayLineView[];
  earnings: string;
  deductions: string;
  net: string;
  employerCost: string;
  variables: RunVariables;
  taxable?: string;
  tax?: RunTaxWorking | null;
  loans?: { loanId: string; amount: string }[];
  settlement?: SettlementWorking | null;
}

/** A person's net moving this much since last month is flagged for review. */
const VARIANCE_FLAG = 0.1;
const BATCH = 500;

const creator = alias(tenantUsers, 'creator');
const submitter = alias(tenantUsers, 'submitter');
const decider = alias(tenantUsers, 'decider');

const sumLines = (lines: PayLineView[], kind: PayLineView['kind']) =>
  lines.filter((l) => l.kind === kind).reduce((s, l) => s.plus(l.amount), new Decimal(0));

/** Kept at what was paid when an adjustment works a period out again. */
const CARRIED = new Set(['TAX', 'ADVANCE', 'LOAN', 'PF_LOAN']);

/** A person the run cannot pay until something is fixed. */
const failed = (code: RunProblemCode, message: string): EngineResult => ({
  status: 'error',
  problems: [{ code, severity: 'error', message }],
  lines: [],
  earnings: '0.00',
  deductions: '0.00',
  net: '0.00',
  employerCost: '0.00',
  variables: {
    periodDays: 0,
    employedDays: 0,
    paidDays: 0,
    workedDays: 0,
    absentDays: 0,
    unpaidLeaveDays: 0,
    otHours: 0,
  },
  taxable: '0.00',
  tax: null,
  loans: [],
});

/**
 * Payroll runs. A run is created for a pay group and month, computed (and recomputed) from
 * approved pay, processed attendance, leave and entered amounts, submitted, approved by a
 * second person, and then locked: its results never change. Corrections are adjustment runs.
 */
@Injectable()
export class PayrollRunsService implements ApprovalSubjectHandler<PayrollRunView> {
  readonly auditPrefix = 'payroll.run';
  readonly entityType = 'payroll_run' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    private readonly calendars: WorkCalendarService,
    private readonly pdf: PdfService,
    private readonly settlements: SettlementsService,
    private readonly wppf: WppfService,
    private readonly policy: PolicyService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  list(): Promise<PayrollRunView[]> {
    return this.tenantDb.run(async (tx) => this.views(tx, undefined));
  }

  view(id: string): Promise<PayrollRunView> {
    return this.tenantDb.run(async (tx) => {
      const [run] = await this.views(tx, eq(payrollRuns.id, id));
      if (!run) throw new NotFoundException('Payroll run not found');
      return run;
    });
  }

  /** One page of a run's people; only that page is decrypted, so a large run stays quick. */
  items(id: string, query: RunItemsQuery): Promise<PayrollRunItemPage> {
    return this.tenantDb.run(async (tx) => {
      const run = await this.runOf(tx, id);
      const search = query.search ? `%${query.search.replaceAll(/[%_\\]/g, '\\$&')}%` : null;
      const where = and(
        eq(payrollRunItems.runId, id),
        query.show === 'problems'
          ? sql`jsonb_array_length(${payrollRunItems.problems}) > 0`
          : undefined,
        query.show === 'errors' ? eq(payrollRunItems.status, 'error') : undefined,
        query.show === 'flagged' ? eq(payrollRunItems.flagged, true) : undefined,
        search
          ? or(
              ilike(employees.employeeCode, search),
              ilike(employees.fullName, search),
              ilike(employees.fullNameBn, search),
            )
          : undefined,
      );
      const [{ total }] = (await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(payrollRunItems)
        .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
        .where(where)) as [{ total: number }];
      const rows = await tx
        .select({ item: payrollRunItems, employee: employees })
        .from(payrollRunItems)
        .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
        .where(where)
        .orderBy(asc(employees.employeeCode))
        .limit(query.size)
        .offset((query.page - 1) * query.size);
      const ids = rows.map((r) => r.employee.id);
      const jobs = await this.jobsOn(tx, ids, run.periodEnd);
      const inputs = await this.inputsOf(tx, run.id, ids);
      const previous = run.kind === 'regular' ? await this.previousNets(tx, run, ids) : null;
      const accountChanges = await this.accountChanges(tx, run, previous?.runId ?? null, ids);
      const items = rows.map(({ item, employee }): PayrollRunItemView => {
        const result = this.decrypt<ItemResult>(item.resultEnc, CIPHER_FIELDS.runResults);
        const prev = previous?.nets.get(employee.id) ?? null;
        const variance = !previous?.runId
          ? null
          : prev === null
            ? 'new'
            : new Decimal(result.net).greaterThan(prev)
              ? 'up'
              : new Decimal(result.net).lessThan(prev)
                ? 'down'
                : 'same';
        const job = jobs.get(employee.id);
        return {
          id: item.id,
          employee: {
            id: employee.id,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            fullNameBn: employee.fullNameBn,
            designation: job?.designation ?? null,
            orgUnit: job?.orgUnit ?? null,
          },
          status: item.status,
          problems: item.problems,
          ...result,
          taxable: result.taxable ?? '0.00',
          tax: result.tax ?? null,
          settlement: result.settlement ?? null,
          inputs: Object.fromEntries(
            (inputs.get(employee.id) ?? []).map((i) => [i.component, money(i.amount)]),
          ),
          previousNet: prev,
          variance,
          variancePercent:
            prev && !new Decimal(prev).isZero()
              ? new Decimal(result.net)
                  .minus(prev)
                  .dividedBy(prev)
                  .times(100)
                  .toDecimalPlaces(1)
                  .toNumber()
              : null,
          accountChangedAt: accountChanges.get(employee.id) ?? null,
          flagged: item.flagged,
        };
      });
      return { items, total, page: query.page, size: query.size };
    });
  }

  // ── Creating and computing ─────────────────────────────────────────────────

  async create(actor: AuthUser, input: RunCreateInput): Promise<PayrollRunView> {
    const id = await this.tenantDb.run(async (tx) => {
      const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, input.payGroupId));
      if (!group?.isActive)
        throw badRequest('pay_group_inactive', 'Choose a pay group that is in use');
      if (group.frequency !== 'monthly') {
        throw badRequest(
          'weekly_runs_later',
          'Weekly pay groups are paid by runs from a later release',
        );
      }
      const { start, end } = monthBounds(input.month);
      const due = await this.paymentDue(tx, end);
      const [existing] = await tx
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.payGroupId, group.id),
            eq(payrollRuns.periodStart, start),
            eq(payrollRuns.kind, 'regular'),
            ne(payrollRuns.status, 'cancelled'),
          ),
        );
      if (existing)
        throw conflict('run_exists', `${group.name} already has a run for ${input.month}`);
      const [row] = await tx
        .insert(payrollRuns)
        .values({
          tenantId: currentTenantId(),
          payGroupId: group.id,
          kind: 'regular',
          periodStart: start,
          periodEnd: end,
          paymentDue: due,
          paymentDate: input.paymentDate ?? due,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.create',
        entityType: 'payroll_run',
        entityId: row!.id,
        after: { payGroup: group.code, month: input.month },
      });
      return row!.id;
    });
    return this.view(id);
  }

  /** Works everyone's pay out again from the current data; the run must not be submitted yet. */
  async compute(actor: AuthUser, id: string, tenant: TenantWithAccess): Promise<PayrollRunView> {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockRun(tx, id);
      if (run.status !== 'draft' && run.status !== 'computed') {
        throw conflict('run_not_open', `This run is ${run.status} and cannot be computed again`);
      }
      const results =
        run.kind === 'regular'
          ? await this.computeRegular(tx, run, tenant)
          : run.kind === 'bonus'
            ? await this.computeBonusRun(tx, run)
            : run.kind === 'settlement'
              ? await this.settlements.compute(tx, run, tenant)
              : run.kind === 'wppf'
                ? await this.wppf.compute(tx, run)
                : await this.computeAdjustment(tx, run, tenant);
      await this.store(tx, run, results);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.compute',
        entityType: 'payroll_run',
        entityId: id,
        after: { headcount: results.length },
      });
    });
    return this.view(id);
  }

  private async computeRegular(tx: Tx, run: RunRow, tenant: TenantWithAccess) {
    const today = todayIn();
    const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, run.payGroupId));
    const people = await tx
      .select({
        id: employees.id,
        joinedOn: employees.joinedOn,
        separatedOn: employees.separatedOn,
        gender: employees.gender,
        dateOfBirth: employees.dateOfBirth,
        hasTin: sql<boolean>`${employees.tinEnc} is not null`,
      })
      .from(employees)
      .where(
        and(
          lte(employees.joinedOn, run.periodEnd),
          or(isNull(employees.separatedOn), sql`${employees.separatedOn} >= ${run.periodStart}`),
        ),
      );
    const pay = await this.approvedPay(tx, run.periodEnd);
    // Members are paid in this group on their last employed day of the period. People with
    // no pay at all are listed in the default group's run, so nobody is missed silently.
    // Leavers whose last month a settlement pays are not paid here as well.
    const settled = await this.settlements.settledIn(tx, run.periodStart);
    const members = people.filter((p) => {
      if (settled.has(p.id)) return false;
      const records = pay.get(p.id);
      if (!records?.length) return group!.isDefault;
      const span = employment({ ...run, joinedOn: p.joinedOn, separatedOn: p.separatedOn });
      const lastDay = span?.to ?? run.periodEnd;
      const inForce = records.filter((r) => r.effectiveFrom <= lastDay).at(-1) ?? records[0]!;
      return inForce.payGroupId === run.payGroupId;
    });
    const ids = members.map((m) => m.id);
    const attendance = await this.attendanceOf(tx, ids, run, tenant);
    const jobs = await this.jobsOn(tx, ids, run.periodEnd);
    const inputs = await this.inputsOf(tx, run.id);
    const components = await componentsOf(tx);
    const previous = await this.previousNets(tx, run);
    const settings = await payrollSettingsOf(tx);
    const pf = await pfRatesFor(
      tx,
      settings,
      ids,
      { start: run.periodStart, end: run.periodEnd },
      this.policy,
    );
    const loans = await loansFor(tx, this.cipher, ids, run.periodStart.slice(0, 7));
    const tax = await taxContextsFor(tx, this.cipher, settings, run, members, components);
    const extra = await extraVariablesOf(tx, ids, run, tenant, {
      production: true,
      unionDues: true,
    });

    return members.map((m) => {
      if (tax === 'missing') {
        return {
          employeeId: m.id,
          result: failed(
            'tax_rules_missing',
            `No salary tax rules for ${fiscalYearOf(run.periodEnd)} yet`,
          ),
          flagged: false,
        };
      }
      const result = computePay({
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        today,
        joinedOn: m.joinedOn,
        separatedOn: m.separatedOn,
        worker: jobs.get(m.id)?.workerCategory !== 'staff',
        records: (pay.get(m.id) ?? []).map((r) => r.engine),
        attendance: attendance ? (attendance.days.get(m.id) ?? []) : null,
        trackingFrom: attendance?.trackingFrom,
        inputs: Object.fromEntries((inputs.get(m.id) ?? []).map((i) => [i.component, i.amount])),
        components,
        pf: pf.get(m.id) ?? null,
        loans: loans.get(m.id) ?? [],
        tax: tax?.get(m.id) ?? null,
        extra: extra.get(m.id),
      });
      const prev = previous.nets.get(m.id);
      const flagged =
        !!previous.runId &&
        (prev === undefined ||
          (!new Decimal(prev).isZero() &&
            new Decimal(result.net)
              .minus(prev)
              .abs()
              .dividedBy(prev)
              .greaterThanOrEqualTo(VARIANCE_FLAG)));
      return { employeeId: m.id, result, flagged };
    });
  }

  /**
   * An adjustment pays the difference between what a period's pay comes to now and what its
   * locked runs already paid, per person and component. People with no difference drop out.
   */
  private async computeAdjustment(tx: Tx, run: RunRow, tenant: TenantWithAccess) {
    const parent = await this.runOf(tx, run.parentRunId!);
    const siblings = await tx
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.parentRunId, parent.id),
          eq(payrollRuns.status, 'locked'),
          ne(payrollRuns.id, run.id),
        ),
      );
    const paidRuns = [parent.id, ...siblings.map((s) => s.id)];
    const paidItems = await tx
      .select()
      .from(payrollRunItems)
      .where(inArray(payrollRunItems.runId, paidRuns));
    const scope = run.scopeEmployeeIds ?? [
      ...new Set(paidItems.filter((i) => i.runId === parent.id).map((i) => i.employeeId)),
    ];
    const people = scope.length
      ? await tx
          .select({
            id: employees.id,
            joinedOn: employees.joinedOn,
            separatedOn: employees.separatedOn,
          })
          .from(employees)
          .where(inArray(employees.id, scope))
      : [];
    const pay = await this.approvedPay(tx, run.periodEnd);
    const attendance = await this.attendanceOf(tx, scope, run, tenant);
    const jobs = await this.jobsOn(tx, scope, run.periodEnd);
    const components = await componentsOf(tx);
    // What was entered for the period stays entered; this adjustment's entries come last.
    const entered = new Map<string, Record<string, string>>();
    for (const runId of [...paidRuns, run.id]) {
      for (const [employeeId, list] of await this.inputsOf(tx, runId)) {
        entered.set(employeeId, {
          ...entered.get(employeeId),
          ...Object.fromEntries(list.map((i) => [i.component, i.amount])),
        });
      }
    }
    const settings = await payrollSettingsOf(tx);
    const pf = await pfRatesFor(
      tx,
      settings,
      scope,
      { start: run.periodStart, end: run.periodEnd },
      this.policy,
    );
    const extra = await extraVariablesOf(tx, scope, run, tenant, {
      production: true,
      unionDues: true,
    });
    const paidLines = new Map<string, PayLineView[]>();
    for (const item of paidItems) {
      const result = this.decrypt<ItemResult>(item.resultEnc, CIPHER_FIELDS.runResults);
      const sums = new Map((paidLines.get(item.employeeId) ?? []).map((l) => [l.code, l]));
      for (const line of result.lines) {
        const before = sums.get(line.code);
        sums.set(line.code, {
          ...line,
          amount: money(new Decimal(before?.amount ?? 0).plus(line.amount)),
        });
      }
      paidLines.set(item.employeeId, [...sums.values()]);
    }

    return people.flatMap((p) => {
      // Tax and loan recoveries stay as paid: the next month's tax picks up the arrears, and
      // loans are repaid on their own schedule.
      const carried = Object.fromEntries(
        (paidLines.get(p.id) ?? [])
          .filter((l) => CARRIED.has(l.code))
          .map((l) => [l.code, l.amount]),
      );
      const now = computePay({
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        today: todayIn(),
        joinedOn: p.joinedOn,
        separatedOn: p.separatedOn,
        worker: jobs.get(p.id)?.workerCategory !== 'staff',
        records: (pay.get(p.id) ?? []).map((r) => r.engine),
        attendance: attendance ? (attendance.days.get(p.id) ?? []) : null,
        trackingFrom: attendance?.trackingFrom,
        inputs: { ...carried, ...entered.get(p.id) },
        components,
        pf: pf.get(p.id) ?? null,
        extra: extra.get(p.id),
      });
      if (now.status === 'error') return [{ employeeId: p.id, result: now, flagged: false }];
      const lines = difference(paidLines.get(p.id) ?? [], now.lines);
      if (lines.length === 0) return [];
      const earnings = sumLines(lines, 'earning');
      const deductions = sumLines(lines, 'deduction');
      const result: EngineResult = {
        ...now,
        // "The period is not over" says nothing new for a correction.
        problems: now.problems.filter((x) => x.code !== 'period_not_over'),
        lines,
        earnings: money(earnings),
        deductions: money(deductions),
        net: money(earnings.minus(deductions)),
        employerCost: money(sumLines(lines, 'employer_cost')),
      };
      return [{ employeeId: p.id, result, flagged: false }];
    });
  }

  private async store(
    tx: Tx,
    run: RunRow,
    results: { employeeId: string; result: EngineResult; flagged: boolean }[],
  ) {
    await tx.delete(payrollRunItems).where(eq(payrollRunItems.runId, run.id));
    for (let i = 0; i < results.length; i += BATCH) {
      await tx.insert(payrollRunItems).values(
        results.slice(i, i + BATCH).map(({ employeeId, result, flagged }) => ({
          tenantId: currentTenantId(),
          runId: run.id,
          employeeId,
          status: result.status,
          problems: result.problems,
          resultEnc: this.encrypt(
            {
              lines: result.lines,
              earnings: result.earnings,
              deductions: result.deductions,
              net: result.net,
              employerCost: result.employerCost,
              variables: result.variables,
              taxable: result.taxable,
              tax: result.tax,
              loans: result.loans,
              settlement: (result as { settlement?: SettlementWorking }).settlement ?? null,
            } satisfies ItemResult,
            CIPHER_FIELDS.runResults,
          ),
          flagged,
        })),
      );
    }
    const ok = results.filter((r) => r.result.status === 'ok');
    const add = (pick: (r: EngineResult) => string) =>
      money(ok.reduce((s, r) => s.plus(pick(r.result)), new Decimal(0)));
    const totals: RunTotals = {
      earnings: add((r) => r.earnings),
      deductions: add((r) => r.deductions),
      net: add((r) => r.net),
      employerCost: add((r) => r.employerCost),
    };
    const previous =
      run.kind === 'regular' ? (await this.previousNets(tx, run)).nets : new Map<string, string>();
    const present = new Set(results.map((r) => r.employeeId));
    const gone = [...previous.keys()].filter((id) => !present.has(id)).length;
    await tx
      .update(payrollRuns)
      .set({
        status: 'computed',
        headcount: results.length,
        totalsEnc: this.encrypt(totals, CIPHER_FIELDS.runTotals),
        errors: results.filter((r) => r.result.status === 'error').length,
        warnings: results.filter((r) => r.result.problems.some((p) => p.severity === 'warning'))
          .length,
        flagged: results.filter((r) => r.flagged).length + gone,
        computedAt: new Date(),
      })
      .where(eq(payrollRuns.id, run.id));
  }

  // ── Entered amounts ────────────────────────────────────────────────────────

  async setInput(actor: AuthUser, id: string, input: RunInputInput): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockRun(tx, id);
      this.mustBeOpen(run);
      const component = (await componentsOf(tx)).find((c) => c.code === input.component);
      if (!component || component.calculation !== 'run' || !component.isActive) {
        throw badRequest('not_a_run_component', `${input.component} is not entered in runs`);
      }
      const [employee] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, input.employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      const values = {
        amountEnc: this.encrypt(input.amount, CIPHER_FIELDS.runInputs),
        note: input.note ?? null,
        createdBy: actor.id,
      };
      await tx
        .insert(payrollInputs)
        .values({
          tenantId: currentTenantId(),
          runId: id,
          employeeId: input.employeeId,
          component: input.component,
          ...values,
        })
        .onConflictDoUpdate({
          target: [payrollInputs.runId, payrollInputs.employeeId, payrollInputs.component],
          set: values,
        });
      // Results no longer match the inputs until the run is computed again.
      await tx.update(payrollRuns).set({ status: 'draft' }).where(eq(payrollRuns.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.input',
        entityType: 'payroll_run',
        entityId: id,
        after: {
          employeeId: input.employeeId,
          component: input.component,
          note: input.note ?? null,
        },
      });
    });
  }

  async removeInput(actor: AuthUser, id: string, input: { employeeId: string; component: string }) {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockRun(tx, id);
      this.mustBeOpen(run);
      await tx
        .delete(payrollInputs)
        .where(
          and(
            eq(payrollInputs.runId, id),
            eq(payrollInputs.employeeId, input.employeeId),
            eq(payrollInputs.component, input.component),
          ),
        );
      await tx.update(payrollRuns).set({ status: 'draft' }).where(eq(payrollRuns.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.input.remove',
        entityType: 'payroll_run',
        entityId: id,
        after: input,
      });
    });
  }

  // ── Submitting, locking, publishing ────────────────────────────────────────

  async submit(actor: AuthUser, id: string): Promise<PayrollRunView> {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockRun(tx, id);
      if (run.status !== 'computed') {
        throw conflict('run_not_computed', 'Compute the run before submitting it');
      }
      if (run.errors > 0) {
        throw badRequest('run_has_errors', `${run.errors} people have problems to fix first`);
      }
      if (run.headcount === 0) throw badRequest('run_empty', 'Nobody is paid in this run');
      await tx
        .update(payrollRuns)
        .set({ status: 'pending', submittedBy: actor.id })
        .where(eq(payrollRuns.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.submit',
        entityType: 'payroll_run',
        entityId: id,
      });
      if ((await payrollSettingsOf(tx)).makerChecker) {
        await tx.insert(approvalSteps).values({
          tenantId: currentTenantId(),
          subjectType: 'payroll_run',
          subjectId: id,
          stepNo: 1,
          kind: 'payroll',
          status: 'pending',
        });
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'payroll_run', id },
          await this.summarize(tx, id),
        );
      } else {
        await this.finalize(tx, id, 'approved', actor.id);
      }
    });
    return this.view(id);
  }

  async cancel(actor: AuthUser, id: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockRun(tx, id);
      if (run.status === 'locked' || run.status === 'cancelled') {
        throw conflict('run_closed', `This run is ${run.status}`);
      }
      await tx.update(payrollRuns).set({ status: 'cancelled' }).where(eq(payrollRuns.id, id));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.cancel',
        entityType: 'payroll_run',
        entityId: id,
      });
    });
  }

  /** Makes a locked run's payslips visible to its people and tells them. */
  async publish(actor: AuthUser, id: string): Promise<PayrollRunView> {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockRun(tx, id);
      if (run.status !== 'locked')
        throw conflict('run_not_locked', 'Only a locked run is published');
      if (run.publishedAt) throw conflict('run_published', 'These payslips are already published');
      await tx.update(payrollRuns).set({ publishedAt: new Date() }).where(eq(payrollRuns.id, id));
      const items = await tx
        .select()
        .from(payrollRunItems)
        .where(and(eq(payrollRunItems.runId, id), eq(payrollRunItems.status, 'ok')));
      const nets = new Map(
        items.map((item) => {
          const net = this.decrypt<ItemResult>(item.resultEnc, CIPHER_FIELDS.runResults).net;
          return [
            item.employeeId,
            { 'pay.net': { en: `Tk ${amountText('en', net)}`, bn: `৳${amountText('bn', net)}` } },
          ];
        }),
      );
      await this.notifications.notify(tx, {
        event: 'payslip.published',
        recipients: items.map((i) => ({ employeeId: i.employeeId })),
        values: {
          'period.name': run.bonus
            ? { en: run.bonus.festival, bn: run.bonus.festivalBn ?? run.bonus.festival }
            : {
                en: periodName('en', run.periodStart, run.periodEnd),
                bn: periodName('bn', run.periodStart, run.periodEnd),
              },
        },
        perRecipient: nets,
        link: '/workspace/payslips',
        dedupeKey: `payslip.published:${id}`,
        data: { runId: id },
      });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.publish',
        entityType: 'payroll_run',
        entityId: id,
        after: { payslips: items.length },
      });
    });
    return this.view(id);
  }

  /**
   * A festival bonus run for a pay group: people of the festival's religions employed on the
   * cut-off day with enough service, each paid a share of their basic. Approved, locked and
   * published like a month.
   */
  async createBonus(actor: AuthUser, input: BonusRunInput): Promise<PayrollRunView> {
    const id = await this.tenantDb.run(async (tx) => {
      const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, input.payGroupId));
      if (!group?.isActive)
        throw badRequest('pay_group_inactive', 'Choose a pay group that is in use');
      const rule: BonusRule = {
        festival: input.festival,
        festivalBn: input.festivalBn ?? null,
        religions: input.religions,
        unrecorded: input.unrecorded,
        cutOff: input.cutOff,
        percentOfBasic: input.percentOfBasic,
        minServiceMonths: input.minServiceMonths,
      };
      const [row] = await tx
        .insert(payrollRuns)
        .values({
          tenantId: currentTenantId(),
          payGroupId: group.id,
          kind: 'bonus',
          bonus: rule,
          periodStart: input.cutOff,
          periodEnd: input.cutOff,
          // Paid before the festival, so the cut-off is also the latest day to pay.
          paymentDue: input.cutOff,
          paymentDate: input.paymentDate ?? input.cutOff,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.bonus',
        entityType: 'payroll_run',
        entityId: row!.id,
        after: { payGroup: group.code, ...rule },
      });
      return row!.id;
    });
    return this.view(id);
  }

  private async computeBonusRun(tx: Tx, run: RunRow) {
    const rule = run.bonus!;
    const people = await tx
      .select()
      .from(employees)
      .where(
        and(
          lte(employees.joinedOn, rule.cutOff),
          or(isNull(employees.separatedOn), sql`${employees.separatedOn} >= ${rule.cutOff}`),
        ),
      );
    const pay = await this.approvedPay(tx, rule.cutOff);
    const components = await componentsOf(tx);
    return people.flatMap((p) => {
      const religionOk = p.religion ? rule.religions.includes(p.religion) : rule.unrecorded;
      const record = pay.get(p.id)?.at(-1);
      if (!religionOk || !record || record.payGroupId !== run.payGroupId) return [];
      const result = computeBonus({
        record: record.engine,
        joinedOn: p.joinedOn,
        cutOff: rule.cutOff,
        percentOfBasic: rule.percentOfBasic,
        minServiceMonths: rule.minServiceMonths,
        components,
      });
      return result && result.lines.length ? [{ employeeId: p.id, result, flagged: false }] : [];
    });
  }

  /** Starts a correction of a locked run, for some people or everyone in it. */
  async createAdjustment(
    actor: AuthUser,
    parentId: string,
    input: AdjustmentCreateInput,
  ): Promise<PayrollRunView> {
    const id = await this.tenantDb.run(async (tx) => {
      const parent = await this.runOf(tx, parentId);
      if (parent.kind !== 'regular' || parent.status !== 'locked') {
        throw badRequest('not_adjustable', 'Only a locked regular run can be adjusted');
      }
      const [open] = await tx
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.parentRunId, parentId),
            inArray(payrollRuns.status, ['draft', 'computed', 'pending']),
          ),
        );
      if (open) throw conflict('adjustment_open', 'This run already has an adjustment in progress');
      const today = todayIn();
      const [row] = await tx
        .insert(payrollRuns)
        .values({
          tenantId: currentTenantId(),
          payGroupId: parent.payGroupId,
          kind: 'adjustment',
          parentRunId: parentId,
          scopeEmployeeIds: input.employeeIds ?? null,
          periodStart: parent.periodStart,
          periodEnd: parent.periodEnd,
          paymentDue: parent.paymentDue,
          paymentDate: today > parent.paymentDate ? today : parent.paymentDate,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.adjust',
        entityType: 'payroll_run',
        entityId: row!.id,
        after: { parentRunId: parentId, people: input.employeeIds?.length ?? 'all' },
      });
      return row!.id;
    });
    return this.view(id);
  }

  // ── Payslips ───────────────────────────────────────────────────────────────

  myPayslips(user: AuthUser): Promise<PayslipSummary[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) return [];
      const rows = await tx
        .select({ item: payrollRunItems, run: payrollRuns })
        .from(payrollRunItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
        .where(
          and(
            eq(payrollRunItems.employeeId, me.id),
            eq(payrollRunItems.status, 'ok'),
            isNotNull(payrollRuns.publishedAt),
          ),
        )
        .orderBy(desc(payrollRuns.periodStart), desc(payrollRuns.publishedAt));
      return rows.map(({ item, run }) => ({
        itemId: item.id,
        runId: run.id,
        kind: run.kind,
        festival: run.bonus?.festival ?? null,
        festivalBn: run.bonus?.festivalBn ?? null,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        paymentDate: run.paymentDate,
        net: this.decrypt<ItemResult>(item.resultEnc, CIPHER_FIELDS.runResults).net,
        publishedAt: run.publishedAt!.toISOString(),
      }));
    });
  }

  /** A payslip PDF: HR's for any item, an employee's only for their own published ones. */
  async payslip(itemId: string, language: 'en' | 'bn', viewer: AuthUser, own: boolean) {
    const html = await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select({ item: payrollRunItems, run: payrollRuns, employee: employees })
        .from(payrollRunItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
        .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
        .where(eq(payrollRunItems.id, itemId));
      if (!row) throw new NotFoundException('Payslip not found');
      if (own) {
        const me = await employeeOfUser(tx, viewer.id);
        if (me?.id !== row.employee.id || !row.run.publishedAt || row.item.status !== 'ok') {
          throw new NotFoundException('Payslip not found');
        }
      }
      const result = this.decrypt<ItemResult>(row.item.resultEnc, CIPHER_FIELDS.runResults);
      const span = employment({
        ...row.run,
        joinedOn: row.employee.joinedOn,
        separatedOn: row.employee.separatedOn,
      });
      const job = (await this.jobsOn(tx, [row.employee.id], span?.to ?? row.run.periodEnd)).get(
        row.employee.id,
      );
      const pick = (en: string | null | undefined, bn: string | null | undefined) =>
        (language === 'bn' && bn ? bn : en) ?? null;
      return payslipHtml({
        language,
        kind: row.run.kind,
        settlement: result.settlement ?? null,
        festival: row.run.bonus
          ? language === 'bn'
            ? (row.run.bonus.festivalBn ?? row.run.bonus.festival)
            : row.run.bonus.festival
          : null,
        company: {
          name: job?.entity?.legalName ?? job?.entity?.name ?? '',
          details: [
            job?.entity?.address ? formatAddress(job.entity.address, language) : null,
            job?.entity?.tin ? `TIN ${job.entity.tin}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        },
        periodStart: row.run.periodStart,
        periodEnd: row.run.periodEnd,
        paymentDate: row.run.paymentDate,
        employee: {
          code: row.employee.employeeCode,
          name: pick(row.employee.fullName, row.employee.fullNameBn)!,
          designation: pick(job?.designation, job?.designationBn),
          orgUnit: pick(job?.orgUnit, job?.orgUnitBn),
          joinedOn: row.employee.joinedOn,
        },
        ...result,
      });
    });
    return {
      bytes: await this.pdf.render(html),
      fileName: `payslip-${itemId.slice(0, 8)}-${language}.pdf`,
    };
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  async lockSubject(tx: Tx, subjectId: string) {
    const [run] = await tx
      .select({ submittedBy: payrollRuns.submittedBy })
      .from(payrollRuns)
      .where(eq(payrollRuns.id, subjectId))
      .for('update');
    // A run is nobody's own request; the person who submitted it may not approve it.
    return run ? { employeeId: '', madeBy: run.submittedBy } : null;
  }

  ownedBy(): SQL {
    return sql`false`;
  }

  madeBy(tx: Tx, userId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(eq(payrollRuns.submittedBy, userId)),
    );
  }

  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    await tx
      .update(payrollRuns)
      .set(
        outcome === 'approved'
          ? { status: 'locked', lockedAt: new Date(), decidedBy: actorUserId }
          : // Back to its maker to correct and submit again.
            { status: 'computed', decidedBy: actorUserId },
      )
      .where(eq(payrollRuns.id, subjectId));
    // Locked: contributions reach the provident fund and repayments the loans.
    if (outcome === 'approved') {
      await postLockedRun(tx, this.cipher, subjectId, actorUserId);
      await this.settleFund(tx, subjectId, actorUserId);
    }
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const [run] = await this.views(tx, eq(payrollRuns.id, step.subjectId));
      if (!run) continue;
      const [previous] = await tx
        .select()
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.payGroupId, run.payGroup.id),
            eq(payrollRuns.kind, 'regular'),
            eq(payrollRuns.status, 'locked'),
            sql`${payrollRuns.periodEnd} < ${run.periodStart}`,
          ),
        )
        .orderBy(desc(payrollRuns.periodStart))
        .limit(1);
      items.push({
        sortKey: run.periodStart,
        item: {
          subjectType: 'payroll_run',
          stepId: step.id,
          kind: 'payroll',
          run,
          previousTotals: previous?.totalsEnc
            ? this.decrypt<RunTotals>(previous.totalsEnc, CIPHER_FIELDS.runTotals)
            : null,
        },
      });
    }
    return items;
  }

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ run: payrollRuns, group: payGroups, submitter: tenantUsers.name })
      .from(payrollRuns)
      .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
      .leftJoin(tenantUsers, eq(tenantUsers.id, payrollRuns.submittedBy))
      .where(eq(payrollRuns.id, subjectId));
    const { run, group } = row!;
    const what = (language: 'en' | 'bn') =>
      language === 'en'
        ? `${run.kind === 'adjustment' ? 'Pay adjustment' : 'Payroll'} for ${periodName('en', run.periodStart, run.periodEnd)}, ${group.name} (${run.headcount} people)`
        : `${periodName('bn', run.periodStart, run.periodEnd)}-এর ${run.kind === 'adjustment' ? 'বেতন সমন্বয়' : 'বেতন'}, ${group.name} (${amountText('bn', String(run.headcount))} জন)`;
    return {
      employeeId: '',
      personName: row!.submitter ?? '',
      summary: { en: what('en'), bn: what('bn') },
      link: `/workspace/payroll/runs/${run.id}`,
      madeBy: run.submittedBy,
      decisionRecipients: run.submittedBy ? [{ userId: run.submittedBy }] : [],
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** A locked settlement ends the leaver's fund membership and pays out what is theirs. */
  private async settleFund(tx: Tx, runId: string, actorUserId: string) {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (run?.kind !== 'settlement' || !run.separationId) return;
    const [separation] = await tx
      .select()
      .from(separations)
      .where(eq(separations.id, run.separationId));
    const [member] = await tx
      .select()
      .from(pfMembers)
      .where(eq(pfMembers.employeeId, separation!.employeeId));
    if (!member || member.leftOn) return;
    await endMembership(
      tx,
      this.cipher,
      separation!.employeeId,
      separation!.lastWorkingDay,
      actorUserId,
      {
        payOut: true,
      },
    );
  }

  private async views(tx: Tx, where: SQL | undefined): Promise<PayrollRunView[]> {
    const rows = await tx
      .select({
        run: payrollRuns,
        group: { id: payGroups.id, code: payGroups.code, name: payGroups.name },
        createdBy: creator.name,
        submittedBy: submitter.name,
        decidedBy: decider.name,
      })
      .from(payrollRuns)
      .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
      .leftJoin(creator, eq(creator.id, payrollRuns.createdBy))
      .leftJoin(submitter, eq(submitter.id, payrollRuns.submittedBy))
      .leftJoin(decider, eq(decider.id, payrollRuns.decidedBy))
      .where(where)
      .orderBy(desc(payrollRuns.periodStart), desc(payrollRuns.createdAt));
    const steps = await loadSteps(
      tx,
      'payroll_run',
      rows.map((r) => r.run.id),
    );
    return rows.map(({ run, group, createdBy, submittedBy, decidedBy }) => ({
      id: run.id,
      kind: run.kind,
      parentRunId: run.parentRunId,
      bonus: run.bonus,
      payGroup: group,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      paymentDue: run.paymentDue,
      paymentDate: run.paymentDate,
      status: run.status,
      headcount: run.headcount,
      totals: run.totalsEnc
        ? this.decrypt<RunTotals>(run.totalsEnc, CIPHER_FIELDS.runTotals)
        : null,
      errors: run.errors,
      warnings: run.warnings,
      flagged: run.flagged,
      createdBy,
      submittedBy,
      decidedBy,
      computedAt: run.computedAt?.toISOString() ?? null,
      lockedAt: run.lockedAt?.toISOString() ?? null,
      publishedAt: run.publishedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      steps: steps.get(run.id) ?? [],
    }));
  }

  private async runOf(tx: Tx, id: string): Promise<RunRow> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id));
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  private async lockRun(tx: Tx, id: string): Promise<RunRow> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).for('update');
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  private mustBeOpen(run: RunRow) {
    if (run.status !== 'draft' && run.status !== 'computed') {
      throw conflict('run_not_open', `This run is ${run.status}; its amounts can no longer change`);
    }
  }

  /** The Labour Act's deadline: the seventh working day after the period (s.123). */
  /** Wages are due before the seventh working day after the period ends (s.123). */
  private paymentDue(tx: Tx, periodEnd: string): Promise<string> {
    return workingDaysAfter(tx, this.calendars, periodEnd, 7);
  }

  private approvedPay(tx: Tx, upTo: string) {
    return approvedPay(tx, this.cipher, upTo);
  }

  private attendanceOf(tx: Tx, ids: string[], run: RunRow, tenant: TenantWithAccess) {
    return attendanceOf(tx, ids, run, tenant);
  }

  private inputsOf(tx: Tx, runId: string, ids?: string[]) {
    return inputsOf(tx, this.cipher, runId, ids);
  }

  /** Each person's net in the group's last locked regular run before this one. */
  /**
   * When each employee's net-pay account last changed since the previous run was locked (or
   * since this period began): the reviewer checks those before approving.
   */
  private async accountChanges(
    tx: Tx,
    run: RunRow,
    previousRunId: string | null,
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const [previous] = previousRunId
      ? await tx
          .select({ lockedAt: payrollRuns.lockedAt })
          .from(payrollRuns)
          .where(eq(payrollRuns.id, previousRunId))
      : [];
    const rows = await tx
      .select({ employeeId: tenantAuditLog.entityId, at: max(tenantAuditLog.createdAt) })
      .from(tenantAuditLog)
      .where(
        and(
          eq(tenantAuditLog.action, PRIMARY_ACCOUNT_CHANGED),
          inArray(tenantAuditLog.entityId, ids),
          previous?.lockedAt
            ? sql`${tenantAuditLog.createdAt} > ${previous.lockedAt}`
            : sql`${tenantAuditLog.createdAt} >= ${run.periodStart}::date`,
        ),
      )
      .groupBy(tenantAuditLog.entityId);
    return new Map(rows.map((r) => [r.employeeId!, r.at!.toISOString()]));
  }

  private async previousNets(
    tx: Tx,
    run: RunRow,
    ids?: string[],
  ): Promise<{ runId: string | null; nets: Map<string, string> }> {
    const [previous] = await tx
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.payGroupId, run.payGroupId),
          eq(payrollRuns.kind, 'regular'),
          eq(payrollRuns.status, 'locked'),
          sql`${payrollRuns.periodEnd} < ${run.periodStart}`,
        ),
      )
      .orderBy(desc(payrollRuns.periodStart))
      .limit(1);
    if (!previous) return { runId: null, nets: new Map() };
    const items = await tx
      .select()
      .from(payrollRunItems)
      .where(
        and(
          eq(payrollRunItems.runId, previous.id),
          eq(payrollRunItems.status, 'ok'),
          ids ? inArray(payrollRunItems.employeeId, ids) : undefined,
        ),
      );
    const nets = new Map(
      items.map((i) => [
        i.employeeId,
        this.decrypt<ItemResult>(i.resultEnc, CIPHER_FIELDS.runResults).net,
      ]),
    );
    return { runId: previous.id, nets };
  }

  /** Each person's job on a date: company, designation and unit, for payslips and lists. */
  private jobsOn(tx: Tx, ids: string[], on: string) {
    return jobsOn(tx, ids, on);
  }

  private encrypt(
    value: unknown,
    field: (typeof CIPHER_FIELDS)[keyof typeof CIPHER_FIELDS],
  ): string {
    return this.cipher.encrypt(JSON.stringify(value), { tenantId: currentTenantId(), field });
  }

  private decrypt<T>(stored: string, field: (typeof CIPHER_FIELDS)[keyof typeof CIPHER_FIELDS]): T {
    return JSON.parse(this.cipher.decrypt(stored, { tenantId: currentTenantId(), field })) as T;
  }
}
