import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalSteps,
  CIPHER_FIELDS,
  employeeLoans,
  employees,
  loanRepayments,
  pfEntries,
  pfMembers,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  money,
  todayIn,
  type ApprovalItem,
  type LoanCreateInput,
  type LoanRepayInput,
  type LoanView,
} from '@gp/shared';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
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
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { payrollSettingsOf } from './payroll-setup.service.js';
import { pfBalances } from './provident-fund.service.js';
import { closeRepaid, sealed } from './run-context.js';

const requester = alias(tenantUsers, 'loan_requester');
const decider = alias(tenantUsers, 'loan_decider');

const KIND_NAMES = {
  advance: { en: 'Salary advance', bn: 'বেতন অগ্রিম' },
  loan: { en: 'Loan', bn: 'ঋণ' },
  pf_loan: { en: 'Provident fund loan', bn: 'ভবিষ্য তহবিল ঋণ' },
} as const;

/**
 * Advances, company loans and loans from the provident fund. Each is approved by a second
 * person (maker-checker), then recovered in monthly installments by payroll runs, which
 * record a repayment when they lock. Amounts are field-encrypted.
 */
@Injectable()
export class LoansService implements ApprovalSubjectHandler<LoanView> {
  readonly auditPrefix = 'payroll.loan';
  readonly entityType = 'loan' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(filter: { employeeId?: string; open?: boolean }): Promise<LoanView[]> {
    return this.tenantDb.run((tx) =>
      this.views(
        tx,
        and(
          filter.employeeId ? eq(employeeLoans.employeeId, filter.employeeId) : undefined,
          filter.open ? inArray(employeeLoans.status, ['pending', 'active']) : undefined,
        ),
      ),
    );
  }

  /** The signed-in employee's own loans. */
  mine(user: AuthUser): Promise<LoanView[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      return me ? this.views(tx, eq(employeeLoans.employeeId, me.id)) : [];
    });
  }

  view(id: string): Promise<LoanView> {
    return this.tenantDb.run(async (tx) => {
      const [loan] = await this.views(tx, eq(employeeLoans.id, id));
      if (!loan) throw new NotFoundException('Loan not found');
      return loan;
    });
  }

  async create(actor: AuthUser, input: LoanCreateInput): Promise<LoanView> {
    const { seal } = sealed(this.cipher);
    const id = await this.tenantDb.run(async (tx) => {
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, input.employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      if (employee.status !== 'active') {
        throw badRequest('separated', 'Loans are only given to active employees');
      }
      if (input.kind === 'pf_loan') await this.checkFundLoan(tx, input);
      const [row] = await tx
        .insert(employeeLoans)
        .values({
          tenantId: currentTenantId(),
          employeeId: input.employeeId,
          kind: input.kind,
          amountsEnc: seal(CIPHER_FIELDS.loanAmounts, {
            principal: money(input.principal),
            installment: money(input.installment),
          }),
          startMonth: input.startMonth,
          reason: input.reason,
          requestedBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.loan.create',
        entityType: 'loan',
        entityId: row!.id,
        // What kind and when, not how much.
        after: { employeeId: input.employeeId, kind: input.kind, startMonth: input.startMonth },
      });
      const settings = await payrollSettingsOf(tx);
      if (settings.makerChecker) {
        await tx.insert(approvalSteps).values({
          tenantId: currentTenantId(),
          subjectType: 'loan',
          subjectId: row!.id,
          stepNo: 1,
          kind: 'payroll',
          status: 'pending',
        });
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'loan', id: row!.id },
          await this.summarize(tx, row!.id),
        );
      } else {
        await this.finalize(tx, row!.id, 'approved', actor.id);
      }
      return row!.id;
    });
    return this.view(id);
  }

  /** Withdraws a loan still waiting for approval. */
  cancel(actor: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const [loan] = await tx
        .select()
        .from(employeeLoans)
        .where(eq(employeeLoans.id, id))
        .for('update');
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.status !== 'pending') {
        throw conflict('not_pending', `This loan is ${loan.status}, not waiting for approval`);
      }
      await tx.update(employeeLoans).set({ status: 'cancelled' }).where(eq(employeeLoans.id, id));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.loan.cancel',
        entityType: 'loan',
        entityId: id,
      });
    });
  }

  /** Records money paid back outside a run; a fully repaid loan closes. */
  async repay(actor: AuthUser, id: string, input: LoanRepayInput): Promise<LoanView> {
    const { seal } = sealed(this.cipher);
    await this.tenantDb.run(async (tx) => {
      const [loan] = await tx
        .select()
        .from(employeeLoans)
        .where(eq(employeeLoans.id, id))
        .for('update');
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.status !== 'active') {
        throw conflict('loan_not_active', `This loan is ${loan.status}`);
      }
      const [view] = await this.views(tx, eq(employeeLoans.id, id));
      if (new Decimal(input.amount).greaterThan(view!.outstanding)) {
        throw badRequest('more_than_owed', `Only ${view!.outstanding} is still owed`);
      }
      await tx.insert(loanRepayments).values({
        tenantId: currentTenantId(),
        loanId: id,
        date: input.date,
        amountEnc: seal(CIPHER_FIELDS.loanRepayments, money(input.amount)),
        note: input.note ?? null,
        createdBy: actor.id,
      });
      if (loan.kind === 'pf_loan') {
        await tx.insert(pfEntries).values({
          tenantId: currentTenantId(),
          employeeId: loan.employeeId,
          date: input.date,
          kind: 'loan_repaid',
          account: 'own',
          amountEnc: seal(CIPHER_FIELDS.pfEntries, money(input.amount)),
          loanId: id,
          note: input.note ?? null,
          createdBy: actor.id,
        });
      }
      await closeRepaid(tx, this.cipher, [id]);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.loan.repay',
        entityType: 'loan',
        entityId: id,
        after: { date: input.date },
      });
    });
    return this.view(id);
  }

  // ── Approval handler ───────────────────────────────────────────────────────

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ employeeId: employeeLoans.employeeId, madeBy: employeeLoans.requestedBy })
      .from(employeeLoans)
      .where(eq(employeeLoans.id, subjectId))
      .for('update');
    return row ?? null;
  }

  ownedBy(tx: Tx, employeeId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: employeeLoans.id })
        .from(employeeLoans)
        .where(eq(employeeLoans.employeeId, employeeId)),
    );
  }

  madeBy(tx: Tx, userId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: employeeLoans.id })
        .from(employeeLoans)
        .where(eq(employeeLoans.requestedBy, userId)),
    );
  }

  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    const [loan] = await tx
      .update(employeeLoans)
      .set({
        status: outcome === 'approved' ? 'active' : 'rejected',
        decidedBy: actorUserId,
        decidedAt: new Date(),
      })
      .where(eq(employeeLoans.id, subjectId))
      .returning();
    // A loan from the fund leaves the member's own account until it is repaid.
    if (outcome === 'approved' && loan!.kind === 'pf_loan') {
      const { seal, open } = sealed(this.cipher);
      const { principal } = open<{ principal: string }>(
        CIPHER_FIELDS.loanAmounts,
        loan!.amountsEnc,
      );
      await tx.insert(pfEntries).values({
        tenantId: currentTenantId(),
        employeeId: loan!.employeeId,
        date: todayIn(),
        kind: 'loan_out',
        account: 'own',
        amountEnc: seal(CIPHER_FIELDS.pfEntries, money(new Decimal(principal).negated())),
        loanId: loan!.id,
        createdBy: actorUserId,
      });
    }
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const [loan] = await this.views(tx, eq(employeeLoans.id, step.subjectId));
      if (!loan) continue;
      items.push({
        sortKey: loan.createdAt.slice(0, 10),
        item: { subjectType: 'loan', stepId: step.id, kind: 'payroll', loan },
      });
    }
    return items;
  }

  /** No amounts: notifications go by email and SMS. */
  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ loan: employeeLoans, employee: employees })
      .from(employeeLoans)
      .innerJoin(employees, eq(employees.id, employeeLoans.employeeId))
      .where(eq(employeeLoans.id, subjectId));
    const kind = KIND_NAMES[row!.loan.kind];
    return {
      employeeId: row!.employee.id,
      personName: row!.employee.fullName,
      summary: { en: kind.en, bn: kind.bn },
      link: '/workspace/payroll/loans',
      madeBy: row!.loan.requestedBy,
      decisionRecipients: row!.loan.requestedBy ? [{ userId: row!.loan.requestedBy }] : [],
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** A fund loan needs a member, and comes out of their own contributions. */
  private async checkFundLoan(tx: Tx, input: LoanCreateInput) {
    const [member] = await tx
      .select()
      .from(pfMembers)
      .where(eq(pfMembers.employeeId, input.employeeId));
    if (!member || member.leftOn) {
      throw badRequest('not_pf_member', 'Only provident fund members can borrow from the fund');
    }
    const balance = (await pfBalances(tx, this.cipher, [input.employeeId])).get(input.employeeId);
    if (new Decimal(input.principal).greaterThan(balance?.own ?? 0)) {
      throw badRequest(
        'more_than_balance',
        `A fund loan can be at most the member's own balance (${money(balance?.own ?? 0)})`,
      );
    }
  }

  private async views(tx: Tx, where: SQL | undefined): Promise<LoanView[]> {
    const { open } = sealed(this.cipher);
    const rows = await tx
      .select({
        loan: employeeLoans,
        employee: employees,
        requestedBy: requester.name,
        decidedBy: decider.name,
      })
      .from(employeeLoans)
      .innerJoin(employees, eq(employees.id, employeeLoans.employeeId))
      .leftJoin(requester, eq(requester.id, employeeLoans.requestedBy))
      .leftJoin(decider, eq(decider.id, employeeLoans.decidedBy))
      .where(where)
      .orderBy(desc(employeeLoans.createdAt));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.loan.id);
    const repayments = await tx
      .select()
      .from(loanRepayments)
      .where(inArray(loanRepayments.loanId, ids))
      .orderBy(loanRepayments.date, loanRepayments.createdAt);
    const steps = await loadSteps(tx, 'loan', ids);
    return rows.map(({ loan, employee, requestedBy, decidedBy }) => {
      const amounts = open<{ principal: string; installment: string }>(
        CIPHER_FIELDS.loanAmounts,
        loan.amountsEnc,
      );
      const paid = repayments
        .filter((r) => r.loanId === loan.id)
        .map((r) => ({
          date: r.date,
          amount: money(open<string>(CIPHER_FIELDS.loanRepayments, r.amountEnc)),
          runId: r.runId,
          note: r.note,
        }));
      const repaid = paid.reduce((sum, r) => sum.plus(r.amount), new Decimal(0));
      return {
        id: loan.id,
        employee: employeeRef(employee),
        kind: loan.kind,
        status: loan.status,
        principal: money(amounts.principal),
        installment: money(amounts.installment),
        repaid: money(repaid),
        outstanding: money(Decimal.max(0, new Decimal(amounts.principal).minus(repaid))),
        startMonth: loan.startMonth,
        reason: loan.reason,
        requestedBy,
        decidedBy,
        createdAt: loan.createdAt.toISOString(),
        decidedAt: loan.decidedAt?.toISOString() ?? null,
        closedAt: loan.closedAt?.toISOString() ?? null,
        repayments: paid,
        steps: steps.get(loan.id) ?? [],
      };
    });
  }
}
