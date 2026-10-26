import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { bdWageBoard } from '@gp/country-packs';
import {
  approvalSteps,
  CIPHER_FIELDS,
  employeePay,
  employees,
  payGroups,
  salaryStructures,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  money,
  todayIn,
  type ApiError,
  type ApprovalItem,
  type ApprovalStepView,
  type EmployeePayView,
  type LineProblem,
  type PayChangeInput,
  type PayPreview,
  type PayPreviewInput,
  type PayRecordView,
} from '@gp/shared';
import { and, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';
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
  whose,
  type Whose,
} from '../approvals/approval-steps.js';
import { loadSteps } from '../approvals/approval-views.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { localDate, NotificationsService } from '../notifications/notifications.service.js';
import { minimumWageCheck, workOutPay, type ComponentInfo } from './pay-calc.js';
import { componentsOf, payrollSettingsOf } from './payroll-setup.service.js';

interface Amounts {
  amount: string;
  fixed: Record<string, string>;
}

const requester = alias(tenantUsers, 'requester');
const decider = alias(tenantUsers, 'decider');

const select = {
  p: employeePay,
  structure: {
    id: salaryStructures.id,
    code: salaryStructures.code,
    name: salaryStructures.name,
    basis: salaryStructures.basis,
    lines: salaryStructures.lines,
    wageBoard: salaryStructures.wageBoard,
  },
  group: { id: payGroups.id, code: payGroups.code, name: payGroups.name },
  employee: {
    id: employees.id,
    employeeCode: employees.employeeCode,
    fullName: employees.fullName,
    fullNameBn: employees.fullNameBn,
  },
  requestedBy: requester.name,
  decidedBy: decider.name,
};

type PayRow = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(tx: Tx, where: SQL) {
  return tx
    .select(select)
    .from(employeePay)
    .innerJoin(salaryStructures, eq(salaryStructures.id, employeePay.structureId))
    .innerJoin(payGroups, eq(payGroups.id, employeePay.payGroupId))
    .innerJoin(employees, eq(employees.id, employeePay.employeeId))
    .leftJoin(requester, eq(requester.id, employeePay.requestedBy))
    .leftJoin(decider, eq(decider.id, employeePay.decidedBy))
    .where(where)
    .orderBy(desc(employeePay.effectiveFrom), desc(employeePay.createdAt));
}

/** A 400 naming each component that could not be worked out. */
function payProblems(problems: LineProblem[]): BadRequestException {
  const body: ApiError = {
    statusCode: 400,
    error: 'Bad Request',
    message: problems.map((p) => (p.code ? `${p.code}: ${p.message}` : p.message)).join('; '),
    code: 'pay_invalid',
    issues: problems.map((p) => ({
      path: p.code ? `fixed.${p.code}` : 'amount',
      message: p.message,
    })),
  };
  return new BadRequestException(body);
}

/**
 * Employees' pay: effective-dated records, each a structure, an amount and fixed amounts.
 * Changes are proposed and, with maker-checker on, approved by a second person through the
 * approvals inbox. Amounts are field-encrypted; the audit log records what changed, not how
 * much.
 */
@Injectable()
export class EmployeePayService implements ApprovalSubjectHandler<PayRecordView> {
  readonly auditPrefix = 'payroll.pay';
  readonly entityType = 'compensation' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  employeePay(employeeId: string): Promise<EmployeePayView> {
    return this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      return this.payViewOf(tx, employeeId, true);
    });
  }

  /** Self-service: one's own pay, without changes still waiting for approval. */
  myPay(user: AuthUser): Promise<EmployeePayView> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return this.payViewOf(tx, me.id, false);
    });
  }

  private async payViewOf(
    tx: Tx,
    employeeId: string,
    withPending: boolean,
  ): Promise<EmployeePayView> {
    const rows = await loadRows(tx, eq(employeePay.employeeId, employeeId));
    const views = await this.toViews(tx, rows);
    const today = todayIn();
    const visible = withPending ? views : views.filter((v) => v.status === 'approved');
    return {
      current: views.find((v) => v.status === 'approved' && v.effectiveFrom <= today) ?? null,
      pending: withPending ? views.filter((v) => v.status === 'pending') : [],
      history: visible,
    };
  }

  /** Works a change out without saving it, for the form's preview. */
  preview(input: PayPreviewInput): Promise<PayPreview> {
    return this.tenantDb.run(async (tx) => {
      const structure = await this.structureOf(tx, input.structureId);
      const components = await componentsOf(tx);
      const result = workOutPay(structure, components, input.amount, input.fixed);
      const on = input.effectiveFrom ?? todayIn();
      return {
        lines: result.lines,
        gross: result.gross,
        minimumWage: result.problems.length
          ? null
          : minimumWageCheck(structure, input.wageGrade ?? null, on, result),
        problems: result.problems,
      };
    });
  }

  // ── Changing ───────────────────────────────────────────────────────────────

  async propose(
    actor: AuthUser,
    employeeId: string,
    input: PayChangeInput,
  ): Promise<PayRecordView> {
    const id = await this.tenantDb.run(async (tx) => {
      // One change at a time per person, decided against the latest approved pay.
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .for('update');
      if (!employee) throw new NotFoundException('Employee not found');
      if (employee.status !== 'active') {
        throw badRequest('separated', 'Pay can only change for active employees');
      }
      if (input.effectiveFrom < employee.joinedOn) {
        throw badRequest(
          'before_joining',
          `Pay cannot start before joining (${employee.joinedOn})`,
        );
      }
      const structure = await this.structureOf(tx, input.structureId);
      if (!structure.isActive)
        throw badRequest('structure_inactive', 'This structure is not in use');
      const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, input.payGroupId));
      if (!group?.isActive) throw badRequest('pay_group_inactive', 'Choose an active pay group');

      const existing = await tx
        .select({ status: employeePay.status, effectiveFrom: employeePay.effectiveFrom })
        .from(employeePay)
        .where(
          and(
            eq(employeePay.employeeId, employeeId),
            inArray(employeePay.status, ['approved', 'pending']),
          ),
        );
      if (existing.some((r) => r.status === 'pending')) {
        throw conflict(
          'pay_change_pending',
          'A pay change for this person is already waiting for approval',
        );
      }
      const latest = existing
        .map((r) => r.effectiveFrom)
        .toSorted()
        .at(-1);
      if (latest && input.effectiveFrom < latest) {
        throw badRequest(
          'pay_backdated',
          `Pay is approved from ${latest}; a change must start on that date or later (arrears come with payroll runs)`,
        );
      }

      const components = await componentsOf(tx);
      const result = workOutPay(structure, components, input.amount, input.fixed);
      if (result.problems.length) throw payProblems(result.problems);
      this.checkMinimumWage(structure, input.wageGrade ?? null, input.effectiveFrom, result);

      const settings = await payrollSettingsOf(tx);
      const [row] = await tx
        .insert(employeePay)
        .values({
          tenantId: currentTenantId(),
          employeeId,
          effectiveFrom: input.effectiveFrom,
          status: 'pending',
          structureId: structure.id,
          payGroupId: group.id,
          amountsEnc: this.encrypt({ amount: input.amount, fixed: input.fixed }),
          wageGrade: input.wageGrade ?? null,
          reason: input.reason,
          requestedBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pay.propose',
        entityType: 'compensation',
        entityId: row!.id,
        // Which pay, not how much: amounts stay encrypted.
        after: {
          employeeId,
          effectiveFrom: input.effectiveFrom,
          structure: structure.code,
          payGroup: group.code,
          wageGrade: input.wageGrade ?? null,
          fixedComponents: Object.keys(input.fixed),
        },
      });
      if (settings.makerChecker) {
        await tx.insert(approvalSteps).values({
          tenantId: currentTenantId(),
          subjectType: 'compensation',
          subjectId: row!.id,
          stepNo: 1,
          kind: 'payroll',
          status: 'pending',
        });
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'compensation', id: row!.id },
          await this.summarize(tx, row!.id),
        );
      } else {
        // One-person payroll: the change stands as made, and the audit log shows who made it.
        await this.finalize(tx, row!.id, 'approved', actor.id);
      }
      return row!.id;
    });
    return this.view(id);
  }

  /** Withdraws a change still waiting for approval. */
  cancel(actor: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx.select().from(employeePay).where(eq(employeePay.id, id)).for('update');
      if (!row) throw new NotFoundException('Pay change not found');
      if (row.status !== 'pending') {
        throw conflict('not_pending', `This change is ${row.status}, not waiting for approval`);
      }
      await tx
        .update(employeePay)
        .set({ status: 'cancelled', decidedBy: actor.id, decidedAt: new Date() })
        .where(eq(employeePay.id, id));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pay.cancel',
        entityType: 'compensation',
        entityId: id,
      });
    });
  }

  private checkMinimumWage(
    structure: Awaited<ReturnType<EmployeePayService['structureOf']>>,
    grade: string | null,
    on: string,
    result: ReturnType<typeof workOutPay>,
  ) {
    if (!structure.wageBoard) return;
    const board = bdWageBoard(structure.wageBoard);
    if (!board || board.effectiveFrom > on) return;
    if (!grade) {
      throw badRequest(
        'wage_grade_required',
        `Choose the ${board.name} grade this person is paid at`,
      );
    }
    if (!board.grades.some((g) => g.grade === grade)) {
      throw badRequest('unknown_wage_grade', `${board.name} has no grade ${grade}`);
    }
    const check = minimumWageCheck(structure, grade, on, result)!;
    if (!check.meets) {
      throw badRequest(
        'below_minimum_wage',
        `Below the minimum wage for ${grade}: at least ${check.minimumGross} gross and ${check.minimumBasic} basic`,
      );
    }
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ employeeId: employeePay.employeeId, madeBy: employeePay.requestedBy })
      .from(employeePay)
      .where(eq(employeePay.id, subjectId))
      .for('update');
    return row ?? null;
  }

  ownedBy(tx: Tx, who: Whose): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx.select({ id: employeePay.id }).from(employeePay).where(whose(employeePay.employeeId, who)),
    );
  }

  madeBy(tx: Tx, userId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: employeePay.id })
        .from(employeePay)
        .where(eq(employeePay.requestedBy, userId)),
    );
  }

  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    const [row] = await tx
      .update(employeePay)
      .set({ status: outcome, decidedBy: actorUserId, decidedAt: new Date() })
      .where(eq(employeePay.id, subjectId))
      .returning();
    if (outcome === 'approved') {
      // A change from the same date replaces what was approved for it.
      await tx
        .update(employeePay)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(employeePay.employeeId, row!.employeeId),
            eq(employeePay.effectiveFrom, row!.effectiveFrom),
            eq(employeePay.status, 'approved'),
            ne(employeePay.id, subjectId),
          ),
        );
    }
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const [change] = await this.toViews(
        tx,
        await loadRows(tx, eq(employeePay.id, step.subjectId)),
      );
      if (!change) continue;
      const before = await loadRows(
        tx,
        and(eq(employeePay.employeeId, change.employee.id), eq(employeePay.status, 'approved'))!,
      );
      const [previous] = await this.toViews(tx, before.slice(0, 1));
      items.push({
        sortKey: change.effectiveFrom,
        item: {
          subjectType: 'compensation',
          stepId: step.id,
          kind: 'payroll',
          change,
          previous: previous ?? null,
        },
      });
    }
    return items;
  }

  view(subjectId: string): Promise<PayRecordView> {
    return this.tenantDb.run(async (tx) => {
      const rows = await loadRows(tx, eq(employeePay.id, subjectId));
      if (rows.length === 0) throw new NotFoundException('Pay change not found');
      return (await this.toViews(tx, rows))[0]!;
    });
  }

  /** No amounts: notifications go by email and SMS. */
  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await loadRows(tx, eq(employeePay.id, subjectId));
    const date = localDate(row!.p.effectiveFrom);
    return {
      employeeId: row!.employee.id,
      personName: row!.employee.fullName,
      summary: { en: `Pay change from ${date.en}`, bn: `${date.bn} থেকে বেতন পরিবর্তন` },
      link: `/workspace/employees/${row!.employee.id}?tab=pay`,
      madeBy: row!.p.requestedBy,
      // The person who proposed it hears the decision; the employee sees it on their payslip.
      decisionRecipients: row!.p.requestedBy ? [{ userId: row!.p.requestedBy }] : [],
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async structureOf(tx: Tx, id: string) {
    const [structure] = await tx.select().from(salaryStructures).where(eq(salaryStructures.id, id));
    if (!structure) throw new NotFoundException('Structure not found');
    return structure;
  }

  private encrypt(amounts: Amounts): string {
    return this.cipher.encrypt(JSON.stringify(amounts), {
      tenantId: currentTenantId(),
      field: CIPHER_FIELDS.payAmounts,
    });
  }

  private decrypt(stored: string): Amounts {
    return JSON.parse(
      this.cipher.decrypt(stored, { tenantId: currentTenantId(), field: CIPHER_FIELDS.payAmounts }),
    ) as Amounts;
  }

  /** Views of these records, with each approved record's end date from the one after it. */
  private async toViews(tx: Tx, rows: PayRow[]): Promise<PayRecordView[]> {
    if (rows.length === 0) return [];
    const components: ComponentInfo[] = await componentsOf(tx);
    const steps = await loadSteps(
      tx,
      'compensation',
      rows.map((r) => r.p.id),
    );
    const employeeIds = [...new Set(rows.map((r) => r.employee.id))];
    const approved = await tx
      .select({ employeeId: employeePay.employeeId, effectiveFrom: employeePay.effectiveFrom })
      .from(employeePay)
      .where(and(inArray(employeePay.employeeId, employeeIds), eq(employeePay.status, 'approved')));
    const endOf = (row: PayRow) => {
      if (row.p.status !== 'approved') return null;
      const next = approved
        .filter((a) => a.employeeId === row.employee.id && a.effectiveFrom > row.p.effectiveFrom)
        .map((a) => a.effectiveFrom)
        .toSorted()[0];
      return next ? addDays(next, -1) : null;
    };
    return rows.map((row) => {
      const amounts = this.decrypt(row.p.amountsEnc);
      const result = workOutPay(row.structure, components, amounts.amount, amounts.fixed);
      return {
        id: row.p.id,
        employee: employeeRef(row.employee),
        effectiveFrom: row.p.effectiveFrom,
        effectiveTo: endOf(row),
        status: row.p.status,
        structure: {
          id: row.structure.id,
          code: row.structure.code,
          name: row.structure.name,
          basis: row.structure.basis,
        },
        payGroup: row.group,
        amount: money(amounts.amount),
        fixed: Object.fromEntries(Object.entries(amounts.fixed).map(([k, v]) => [k, money(v)])),
        wageGrade: row.p.wageGrade,
        lines: result.lines,
        gross: result.gross,
        minimumWage: minimumWageCheck(row.structure, row.p.wageGrade, row.p.effectiveFrom, result),
        reason: row.p.reason,
        requestedBy: row.requestedBy,
        decidedBy: row.decidedBy,
        createdAt: row.p.createdAt.toISOString(),
        decidedAt: row.p.decidedAt?.toISOString() ?? null,
        steps: steps.get(row.p.id) ?? ([] as ApprovalStepView[]),
      };
    });
  }
}
