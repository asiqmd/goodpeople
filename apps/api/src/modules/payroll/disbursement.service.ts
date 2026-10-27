import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BD_MFS_LIMITS } from '@gp/country-packs';
import {
  CIPHER_FIELDS,
  employeePaymentAccounts,
  employees,
  payGroups,
  payrollRunItems,
  payrollRuns,
  paymentChecks,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  DEFAULT_GL_ACCOUNTS,
  Decimal,
  money,
  type DisbursementChannel,
  type DisbursementProblem,
  type DisbursementView,
  type EmployeeRef,
  type GlAccounts,
  type PayLineView,
  type PaymentCheckView,
  type ReturnedPayment,
} from '@gp/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { readSheet, unreadableSheet } from '../../common/sheets.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { PdfService } from '../letters/pdf.service.js';
import { ProjectSharesService, type EmployeeShares } from '../projects/project-shares.service.js';
import { splitAmount } from '../projects/shares.js';
import { allocate, channelOf, csv, type PayableAccount, type Payment } from './disbursement.js';
import { componentsOf, payrollSettingsOf } from './payroll-setup.service.js';
import { bankAdviceHtml, cashSheetHtml } from './disbursement-pdf.js';
import { checkPayments, isReportHeading } from './payment-check.js';
import { jobsOn, sealed, type JobOnDate, type StoredResult } from './run-context.js';

type RunRow = typeof payrollRuns.$inferSelect;

/** A person's payments in a run, with what the files and the cash sheet need. */
export interface PersonPayments {
  employee: EmployeeRef;
  net: string;
  job: JobOnDate | undefined;
  payments: Payment[];
}

/**
 * Paying a locked run: each person's net split across their accounts, the bank transfer file
 * (BEFTN), one file per mobile wallet, the cash sheet with a signature column, the advice
 * letter to the company's bank, the day it was paid, and the journal for the accounts.
 */
@Injectable()
export class DisbursementService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly pdf: PdfService,
    private readonly projectShares: ProjectSharesService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Totals by channel and the accounts that need fixing before the files go out. */
  summary(runId: string): Promise<DisbursementView> {
    return this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      const people = await this.peopleOf(tx, run);
      const channels = new Map<string, DisbursementChannel>();
      const problems: DisbursementProblem[] = [];
      for (const p of people) {
        for (const pay of p.payments) {
          const key = channelOf(pay);
          const c = channels.get(key) ?? { channel: key, people: 0, payments: 0, amount: '0.00' };
          c.payments += 1;
          c.amount = money(new Decimal(c.amount).plus(pay.amount));
          channels.set(key, c);
          if (pay.method === 'bank' && (!pay.routingNumber || !pay.accountNumber)) {
            problems.push({ employee: p.employee, issue: 'bank_incomplete' });
          }
          if (pay.method === 'mfs' && !pay.accountNumber) {
            problems.push({ employee: p.employee, issue: 'wallet_incomplete' });
          }
          if (
            pay.method === 'mfs' &&
            new Decimal(pay.amount).greaterThan(BD_MFS_LIMITS.balanceCap)
          ) {
            problems.push({ employee: p.employee, issue: 'wallet_over_limit' });
          }
        }
        for (const key of new Set(p.payments.map(channelOf))) channels.get(key)!.people += 1;
      }
      const total = people.reduce((sum, p) => sum.plus(p.net), new Decimal(0));
      return {
        runId: run.id,
        paymentDue: run.paymentDue,
        paymentDate: run.paymentDate,
        paidOn: run.paidOn,
        late: run.paidOn ? run.paidOn > run.paymentDue : null,
        people: people.length,
        total: money(total),
        channels: [...channels.values()].toSorted((a, b) => a.channel.localeCompare(b.channel)),
        problems,
      };
    });
  }

  /**
   * The bank transfer file: one row per bank payment, with what corporate banking portals
   * ask for a BEFTN upload. Banks' own templates differ in column order, not in content.
   */
  bankFile(actor: AuthUser, runId: string): Promise<{ text: string; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      await this.recordExport(tx, actor, runId, 'bank');
      const rows: string[][] = [
        [
          'SL',
          'Employee code',
          'Beneficiary name',
          'Bank',
          'Branch',
          'Routing number',
          'Account number',
          'Amount',
          'Reference',
        ],
      ];
      for (const p of await this.peopleOf(tx, run)) {
        for (const pay of p.payments.filter((x) => x.method === 'bank')) {
          rows.push([
            String(rows.length),
            p.employee.employeeCode,
            pay.accountName ?? p.employee.fullName,
            pay.provider ?? '',
            pay.branchName ?? '',
            pay.routingNumber ?? '',
            pay.accountNumber ?? '',
            pay.amount,
            reference(run),
          ]);
        }
      }
      return { text: csv(rows), fileName: `bank-${run.periodStart}-${run.id.slice(0, 8)}.csv` };
    });
  }

  /** One mobile wallet's bulk disbursement file: wallet number, amount, name, reference. */
  walletFile(
    actor: AuthUser,
    runId: string,
    provider: string,
  ): Promise<{ text: string; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      await this.recordExport(tx, actor, runId, provider);
      const rows: string[][] = [
        ['SL', 'Wallet number', 'Amount', 'Name', 'Employee code', 'Reference'],
      ];
      for (const p of await this.peopleOf(tx, run)) {
        for (const pay of p.payments.filter((x) => x.method === 'mfs' && x.provider === provider)) {
          rows.push([
            String(rows.length),
            pay.accountNumber ?? '',
            pay.amount,
            p.employee.fullName,
            p.employee.employeeCode,
            reference(run),
          ]);
        }
      }
      return {
        text: csv(rows),
        fileName: `${provider}-${run.periodStart}-${run.id.slice(0, 8)}.csv`,
      };
    });
  }

  /** The pay sheet for those paid in cash, by unit, with a column to sign or thumb-print. */
  async cashSheet(runId: string, language: 'en' | 'bn') {
    const html = await this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      const people = (await this.peopleOf(tx, run))
        .map((p) => ({ ...p, cash: p.payments.filter((x) => x.method === 'cash') }))
        .filter((p) => p.cash.length);
      const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, run.payGroupId));
      return cashSheetHtml({
        language,
        company: companyOf(people[0]?.job, language),
        group: group!.name,
        run,
        rows: people.map((p) => ({
          code: p.employee.employeeCode,
          name:
            language === 'bn' && p.employee.fullNameBn
              ? p.employee.fullNameBn
              : p.employee.fullName,
          designation:
            (language === 'bn' ? p.job?.designationBn : null) ?? p.job?.designation ?? null,
          unit: (language === 'bn' ? p.job?.orgUnitBn : null) ?? p.job?.orgUnit ?? null,
          amount: money(p.cash.reduce((s, x) => s.plus(x.amount), new Decimal(0))),
        })),
      });
    });
    return {
      bytes: await this.pdf.render(html),
      fileName: `cash-sheet-${runId.slice(0, 8)}-${language}.pdf`,
    };
  }

  /** The letter asking the company's bank to pay the transfer and wallet files. */
  async bankAdvice(runId: string, language: 'en' | 'bn') {
    const summary = await this.summary(runId);
    const html = await this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      const [first] = await tx
        .select({ id: payrollRunItems.employeeId })
        .from(payrollRunItems)
        .where(eq(payrollRunItems.runId, runId))
        .limit(1);
      const job = first ? (await jobsOn(tx, [first.id], run.periodEnd)).get(first.id) : undefined;
      return bankAdviceHtml({
        language,
        company: companyOf(job, language),
        run,
        channels: summary.channels.filter((c) => c.channel !== 'cash'),
      });
    });
    return {
      bytes: await this.pdf.render(html),
      fileName: `bank-advice-${runId.slice(0, 8)}-${language}.pdf`,
    };
  }

  /**
   * Matches a bank's or wallet provider's report on the run's payments (a returns file, or a
   * status for every payment) and keeps what came back, with the reason.
   */
  async checkPayments(
    actor: AuthUser,
    runId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<PaymentCheckView> {
    if (!file) throw badRequest('file_required', "Choose the bank's report");
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) {
      throw badRequest('sheet_type', 'Upload the report as .xlsx or .csv');
    }
    const sheet = await readSheet(file, isReportHeading).catch(unreadableSheet);
    if (!sheet.headers.some((h) => isReportHeading([h]))) {
      throw badRequest('report_no_account', 'The report has no account number column');
    }
    return this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      const sent = (await this.peopleOf(tx, run)).flatMap((p) =>
        p.payments
          .filter((pay) => pay.method !== 'cash' && pay.accountNumber)
          .map((pay) => ({
            employee: p.employee,
            channel: channelOf(pay),
            accountNumber: pay.accountNumber!,
            amount: pay.amount,
          })),
      );
      const result = checkPayments(sheet, sent);
      const [row] = await tx
        .insert(paymentChecks)
        .values({
          tenantId: currentTenantId(),
          runId,
          fileName: file.originalname.slice(0, 200),
          summary: result.summary,
          resultEnc: sealed(this.cipher).seal(CIPHER_FIELDS.paymentCheck, result.returned),
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.payment_check',
        entityType: 'payroll_run',
        entityId: runId,
        after: { checkId: row!.id, fileName: row!.fileName, ...result.summary },
      });
      return this.checkView(row!);
    });
  }

  /** The run's checked reports, newest first. */
  paymentChecks(runId: string): Promise<PaymentCheckView[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select()
        .from(paymentChecks)
        .where(eq(paymentChecks.runId, runId))
        .orderBy(desc(paymentChecks.createdAt));
      return rows.map((r) => this.checkView(r));
    });
  }

  /** What came back, as CSV, to pay again by cash or in the next run. */
  returnedCsv(checkId: string): Promise<{ text: string; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx.select().from(paymentChecks).where(eq(paymentChecks.id, checkId));
      if (!row) throw new NotFoundException('Payment report not found');
      const view = this.checkView(row);
      return {
        text: csv([
          ['Employee code', 'Name', 'Paid by', 'Account', 'Amount', 'Code', 'Reason'],
          ...view.returned.map((r) => [
            r.employee?.employeeCode ?? '',
            r.employee?.fullName ?? '',
            r.channel,
            r.account,
            r.amount,
            r.code ?? '',
            r.reason,
          ]),
        ]),
        fileName: `returned-payments-${row.createdAt.toISOString().slice(0, 10)}.csv`,
      };
    });
  }

  private checkView(row: typeof paymentChecks.$inferSelect): PaymentCheckView {
    return {
      id: row.id,
      runId: row.runId,
      fileName: row.fileName,
      createdAt: row.createdAt.toISOString(),
      summary: row.summary,
      returned: sealed(this.cipher).open<ReturnedPayment[]>(
        CIPHER_FIELDS.paymentCheck,
        row.resultEnc,
      ),
    };
  }

  /** Records the day the money went out; after the s.123 deadline it is shown as late. */
  async markPaid(actor: AuthUser, runId: string, paidOn: string): Promise<DisbursementView> {
    await this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      if (paidOn < run.periodStart) {
        throw badRequest('paid_before_period', 'A run cannot be paid before its period starts');
      }
      await tx.update(payrollRuns).set({ paidOn }).where(eq(payrollRuns.id, runId));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.paid',
        entityType: 'payroll_run',
        entityId: runId,
        after: { paidOn, late: paidOn > run.paymentDue },
      });
    });
    return this.summary(runId);
  }

  /**
   * The run as journal lines, by account, cost centre (the unit) and project: earnings and
   * employer costs debited to expense, deductions and net pay credited to what is owed. It
   * balances. Expense is charged to each person's projects by their shares for the month,
   * the rest to no project; what is owed is not split.
   */
  async journal(runId: string): Promise<{ text: string; fileName: string }> {
    const split = await this.projectShares.inPlan();
    return this.tenantDb.run(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      const settings = await payrollSettingsOf(tx);
      const gl = { ...DEFAULT_GL_ACCOUNTS, ...settings.glAccounts };
      const components = new Map((await componentsOf(tx)).map((c) => [c.code, c]));
      const { open } = sealed(this.cipher);
      const items = await tx
        .select()
        .from(payrollRunItems)
        .where(and(eq(payrollRunItems.runId, runId), eq(payrollRunItems.status, 'ok')));
      const ids = items.map((i) => i.employeeId);
      const jobs = await jobsOn(tx, ids, run.periodEnd);
      const shares = split
        ? await this.projectShares.sharesFor(tx, ids, run.periodStart.slice(0, 7))
        : new Map<string, EmployeeShares>();
      // Paying gratuity from its provision, or the fund's share, settles what is owed.
      const owed = new Set([gl.gratuityProvision, gl.wppfPayable]);
      const totals = new Map<
        string,
        {
          account: string;
          centre: string;
          project: string;
          text: string;
          dr: Decimal;
          cr: Decimal;
        }
      >();
      const post = (
        account: string,
        centre: string,
        project: string,
        text: string,
        dr: Decimal | number,
        cr: Decimal | number,
      ) => {
        const key = `${account}|${centre}|${project}|${text}`;
        const t = totals.get(key) ?? {
          account,
          centre,
          project,
          text,
          dr: new Decimal(0),
          cr: new Decimal(0),
        };
        t.dr = t.dr.plus(dr);
        t.cr = t.cr.plus(cr);
        totals.set(key, t);
      };
      for (const item of items) {
        const { lines } = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc);
        const centre = jobs.get(item.employeeId)?.orgUnitCode ?? '';
        const mine = shares.get(item.employeeId)?.shares ?? [];
        const fractions = mine.map((s) => s.fraction);
        // A part per project, rounded to the paisa so the person's parts add up exactly.
        const charge = (account: string, text: string, amount: Decimal) => {
          const { parts, rest } = splitAmount(amount, fractions);
          mine.forEach((s, i) => post(account, centre, s.code, text, parts[i]!, 0));
          post(account, centre, '', text, rest, 0);
        };
        let net = new Decimal(0);
        for (const line of lines) {
          const own = components.get(line.code)?.glAccount ?? null;
          const amount = new Decimal(line.amount);
          if (line.kind === 'earning') {
            const account = accountFor(line, own, gl, settings.gratuityEnabled);
            if (owed.has(account)) post(account, centre, '', line.name, amount, 0);
            else charge(account, line.name, amount);
            net = net.plus(amount);
          } else if (line.kind === 'deduction') {
            const account = deductionAccount(line.code, own, gl);
            // Absence and the like reduce the salary cost, so they are split as it is.
            if (account === gl.salaryExpense) charge(account, line.name, amount.negated());
            else post(account, centre, '', line.name, 0, amount);
            net = net.minus(amount);
          } else if (line.kind === 'employer_cost') {
            charge(own ?? gl.salaryExpense, line.name, amount);
            post(
              line.code.startsWith('PF_') ? gl.pfPayable : gl.netPayable,
              centre,
              '',
              line.name,
              0,
              amount,
            );
          }
        }
        post(gl.netPayable, centre, '', 'Net pay', 0, net);
      }
      const date = run.paidOn ?? run.paymentDate;
      const rows: string[][] = [
        [
          'Date',
          'Account',
          'Cost centre',
          'Project',
          'Description',
          'Debit',
          'Credit',
          'Reference',
        ],
      ];
      for (const t of [...totals.values()].toSorted(
        (a, b) =>
          a.account.localeCompare(b.account) ||
          a.centre.localeCompare(b.centre) ||
          a.project.localeCompare(b.project),
      )) {
        // Negative amounts (an adjustment paying back) go to the other side.
        const balance = t.dr.minus(t.cr);
        if (balance.isZero()) continue;
        rows.push([
          date,
          t.account,
          t.centre,
          t.project,
          t.text,
          balance.greaterThan(0) ? money(balance) : '',
          balance.lessThan(0) ? money(balance.negated()) : '',
          reference(run),
        ]);
      }
      return { text: csv(rows), fileName: `journal-${run.periodStart}-${run.id.slice(0, 8)}.csv` };
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Files with account numbers leave a trace of who took them. */
  private recordExport(tx: Tx, actor: AuthUser, runId: string, channel: string) {
    return this.audit.record(tx, {
      actorUserId: actor.id,
      action: 'payroll.run.payment_file',
      entityType: 'payroll_run',
      entityId: runId,
      after: { channel },
    });
  }

  private async lockedRun(tx: Tx, runId: string): Promise<RunRow> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'locked') throw conflict('run_not_locked', 'Only a locked run is paid');
    return run;
  }

  private async peopleOf(tx: Tx, run: RunRow): Promise<PersonPayments[]> {
    const { open } = sealed(this.cipher);
    const items = await tx
      .select({ item: payrollRunItems, employee: employees })
      .from(payrollRunItems)
      .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
      .where(and(eq(payrollRunItems.runId, run.id), eq(payrollRunItems.status, 'ok')))
      .orderBy(asc(employees.employeeCode));
    const ids = items.map((i) => i.employee.id);
    const accounts = new Map<string, PayableAccount[]>();
    if (ids.length) {
      const rows = await tx
        .select()
        .from(employeePaymentAccounts)
        .where(inArray(employeePaymentAccounts.employeeId, ids));
      for (const a of rows) {
        const list = accounts.get(a.employeeId) ?? [];
        list.push({
          method: a.method,
          provider: a.provider,
          branchName: a.branchName,
          routingNumber: a.routingNumber,
          accountName: a.accountName,
          accountNumber: a.accountNumberEnc
            ? this.cipher.decrypt(a.accountNumberEnc, {
                tenantId: currentTenantId(),
                field: CIPHER_FIELDS.accountNumber,
              })
            : null,
          isPrimary: a.isPrimary,
          splitAmount: a.splitAmount,
        });
        accounts.set(a.employeeId, list);
      }
    }
    const jobs = await jobsOn(tx, ids, run.periodEnd);
    return items.map(({ item, employee }) => {
      const { net } = open<{ net: string }>(CIPHER_FIELDS.runResults, item.resultEnc);
      return {
        employee: employeeRef(employee),
        net,
        job: jobs.get(employee.id),
        payments: allocate(net, accounts.get(employee.id) ?? []),
      };
    });
  }
}

/** What a payment carries to identify it on the bank's side. */
const PREFIX: Record<RunRow['kind'], string> = {
  regular: 'SAL',
  adjustment: 'ADJ',
  bonus: 'BON',
  settlement: 'FS',
  wppf: 'WPPF',
};
/** The payment reference: the month paid, or for the fund the accounting year. */
const reference = (run: RunRow) =>
  run.kind === 'wppf'
    ? `WPPF-${run.periodStart.slice(0, 4)}-${run.periodEnd.slice(2, 4)}`
    : `${PREFIX[run.kind]}-${run.periodStart.slice(0, 7)}`;

const companyOf = (job: JobOnDate | undefined, language: 'en' | 'bn') => ({
  name: job?.entity?.legalName ?? job?.entity?.name ?? '',
  details: [job?.entity?.tin ? `TIN ${job.entity.tin}` : null].filter(Boolean).join(' · '),
  language,
});

/**
 * Earnings go to their own account; gratuity paid out draws on the provision when there is
 * one, and a participation fund share settles what the fund owes.
 */
function accountFor(line: PayLineView, own: string | null, gl: GlAccounts, provided: boolean) {
  if (own) return own;
  if (line.code === 'GRATUITY' && provided) return gl.gratuityProvision;
  if (line.code === 'WPPF') return gl.wppfPayable;
  return gl.salaryExpense;
}

/** Tax and fund deductions are owed onward; loan recoveries reduce what staff owe. */
function deductionAccount(code: string, own: string | null, gl: GlAccounts) {
  if (own) return own;
  if (code === 'TAX' || code === 'WPPF_TDS') return gl.taxPayable;
  if (code === 'PF_EMPLOYEE' || code === 'PF_LOAN') return gl.pfPayable;
  if (code === 'ADVANCE' || code === 'LOAN') return gl.loansReceivable;
  // Absence and the like reduce the salary cost.
  return gl.salaryExpense;
}
