import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  designations,
  employees,
  jobAssignments,
  legalEntities,
  payrollRunItems,
  payrollRuns,
  taxDeclarations,
  taxDeposits,
  taxOpenings,
  taxProfiles,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  fiscalYearBounds,
  fiscalYearOf,
  formatAddress,
  money,
  todayIn,
  type DeclarationVerifyInput,
  type RunTaxWorking,
  type TaxDeclarationInput,
  type TaxDeclarationView,
  type TaxDepositInput,
  type TaxOpeningInput,
  type TaxProfileInput,
  type TaxProfileView,
  type TaxYearView,
} from '@gp/shared';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { PdfService } from '../letters/pdf.service.js';
import { csvField } from './disbursement.js';
import { componentsOf } from './payroll-setup.service.js';
import { salaryIn, sealed, type DeclarationItem, type StoredResult } from './run-context.js';
import { certificateHtml } from './tax-certificate.js';

type Employee = typeof employees.$inferSelect;

/**
 * Salary tax beyond each month's run: who pays at a higher threshold, the investments
 * employees declare for the rebate and payroll verifies, figures from before go-live, the
 * challans that deposited each run's tax, and the year's certificate.
 */
@Injectable()
export class TaxService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly pdf: PdfService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  // ── Profiles ───────────────────────────────────────────────────────────────

  profile(employeeId: string): Promise<TaxProfileView> {
    return this.tenantDb.run((tx) => this.profileOf(tx, employeeId));
  }

  async setProfile(actor: AuthUser, employeeId: string, input: TaxProfileInput) {
    await this.tenantDb.run(async (tx) => {
      await this.employee(tx, employeeId);
      const values = { ...input, updatedBy: actor.id, updatedAt: new Date() };
      await tx
        .insert(taxProfiles)
        .values({ tenantId: currentTenantId(), employeeId, ...values })
        .onConflictDoUpdate({
          target: [taxProfiles.tenantId, taxProfiles.employeeId],
          set: values,
        });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.tax.profile',
        entityType: 'employee',
        entityId: employeeId,
        after: input,
      });
    });
    return this.profile(employeeId);
  }

  // ── Declarations ───────────────────────────────────────────────────────────

  declaration(employeeId: string, fiscalYear?: string): Promise<TaxDeclarationView> {
    return this.tenantDb.run(async (tx) =>
      this.declarationOf(tx, await this.employee(tx, employeeId), fiscalYear ?? thisYear()),
    );
  }

  myDeclaration(user: AuthUser, fiscalYear?: string): Promise<TaxDeclarationView> {
    return this.tenantDb.run(async (tx) =>
      this.declarationOf(tx, await this.me(tx, user), fiscalYear ?? thisYear()),
    );
  }

  /** The year's declarations sent to payroll, waiting ones first, for verifying. */
  declarations(fiscalYear: string): Promise<TaxDeclarationView[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ employee: employees })
        .from(taxDeclarations)
        .innerJoin(employees, eq(employees.id, taxDeclarations.employeeId))
        .where(
          and(
            eq(taxDeclarations.fiscalYear, fiscalYear),
            inArray(taxDeclarations.status, ['submitted', 'verified']),
          ),
        )
        .orderBy(desc(taxDeclarations.status), asc(employees.employeeCode));
      const out: TaxDeclarationView[] = [];
      for (const { employee } of rows) out.push(await this.declarationOf(tx, employee, fiscalYear));
      return out;
    });
  }

  /** An employee's own declaration: a draft until submitted; verified ones are closed. */
  async saveMyDeclaration(user: AuthUser, fiscalYear: string, input: TaxDeclarationInput) {
    const employeeId = await this.tenantDb.run(async (tx) => (await this.me(tx, user)).id);
    return this.saveDeclaration(user, employeeId, fiscalYear, input);
  }

  async saveDeclaration(
    actor: AuthUser,
    employeeId: string,
    fiscalYear: string,
    input: TaxDeclarationInput,
  ): Promise<TaxDeclarationView> {
    const { seal } = sealed(this.cipher);
    await this.tenantDb.run(async (tx) => {
      await this.employee(tx, employeeId);
      const [existing] = await tx
        .select()
        .from(taxDeclarations)
        .where(
          and(
            eq(taxDeclarations.employeeId, employeeId),
            eq(taxDeclarations.fiscalYear, fiscalYear),
          ),
        )
        .for('update');
      if (existing?.status === 'verified') {
        throw conflict('declaration_verified', 'Payroll has verified this declaration already');
      }
      const items: DeclarationItem[] = input.items.map((i) => ({
        kind: i.kind,
        declared: money(i.declared),
        verified: null,
        note: i.note ?? null,
        documentId: i.documentId ?? null,
      }));
      const values = {
        itemsEnc: seal(CIPHER_FIELDS.taxDeclarations, items),
        status: input.submit ? ('submitted' as const) : (existing?.status ?? ('draft' as const)),
        submittedAt: input.submit ? new Date() : (existing?.submittedAt ?? null),
        updatedAt: new Date(),
      };
      await tx
        .insert(taxDeclarations)
        .values({ tenantId: currentTenantId(), employeeId, fiscalYear, ...values })
        .onConflictDoUpdate({
          target: [
            taxDeclarations.tenantId,
            taxDeclarations.employeeId,
            taxDeclarations.fiscalYear,
          ],
          set: values,
        });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: input.submit ? 'payroll.tax.declaration.submit' : 'payroll.tax.declaration.save',
        entityType: 'employee',
        entityId: employeeId,
        after: { fiscalYear, items: items.map((i) => i.kind) },
      });
    });
    return this.declaration(employeeId, fiscalYear);
  }

  /** Payroll's check of the proofs: what it accepts of each item. */
  async verify(
    actor: AuthUser,
    employeeId: string,
    fiscalYear: string,
    input: DeclarationVerifyInput,
  ): Promise<TaxDeclarationView> {
    const { seal, open } = sealed(this.cipher);
    await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(taxDeclarations)
        .where(
          and(
            eq(taxDeclarations.employeeId, employeeId),
            eq(taxDeclarations.fiscalYear, fiscalYear),
          ),
        )
        .for('update');
      if (!row || row.status === 'draft') {
        throw badRequest('declaration_not_submitted', 'Nothing has been submitted for this year');
      }
      const items = open<DeclarationItem[]>(CIPHER_FIELDS.taxDeclarations, row.itemsEnc);
      if (input.verified.length !== items.length) {
        throw badRequest('verify_every_item', 'Give an accepted amount for every item');
      }
      const checked = items.map((item, i) => {
        const accepted = new Decimal(input.verified[i]!);
        if (accepted.greaterThan(item.declared)) {
          throw badRequest('more_than_declared', 'Accept at most what was declared');
        }
        return { ...item, verified: money(accepted) };
      });
      await tx
        .update(taxDeclarations)
        .set({
          itemsEnc: seal(CIPHER_FIELDS.taxDeclarations, checked),
          status: 'verified',
          verifiedBy: actor.id,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(taxDeclarations.id, row.id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.tax.declaration.verify',
        entityType: 'employee',
        entityId: employeeId,
        after: { fiscalYear },
      });
    });
    return this.declaration(employeeId, fiscalYear);
  }

  // ── Openings and deposits ──────────────────────────────────────────────────

  async setOpening(actor: AuthUser, employeeId: string, input: TaxOpeningInput) {
    const { seal } = sealed(this.cipher);
    await this.tenantDb.run(async (tx) => {
      await this.employee(tx, employeeId);
      const values = {
        amountsEnc: seal(CIPHER_FIELDS.taxOpenings, {
          salary: money(input.salary),
          tax: money(input.tax),
          pf: money(input.pf),
        }),
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      await tx
        .insert(taxOpenings)
        .values({
          tenantId: currentTenantId(),
          employeeId,
          fiscalYear: input.fiscalYear,
          ...values,
        })
        .onConflictDoUpdate({
          target: [taxOpenings.tenantId, taxOpenings.employeeId, taxOpenings.fiscalYear],
          set: values,
        });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.tax.opening',
        entityType: 'employee',
        entityId: employeeId,
        after: { fiscalYear: input.fiscalYear },
      });
    });
    return this.year(employeeId, input.fiscalYear);
  }

  /** Records the challan that deposited a locked run's tax. */
  async setDeposit(actor: AuthUser, runId: string, input: TaxDepositInput) {
    const { seal } = sealed(this.cipher);
    await this.tenantDb.run(async (tx) => {
      const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
      if (!run) throw new NotFoundException('Payroll run not found');
      if (run.status !== 'locked')
        throw conflict('run_not_locked', 'Only a locked run has tax to deposit');
      const values = {
        challanNo: input.challanNo,
        depositedOn: input.depositedOn,
        amountEnc: seal(CIPHER_FIELDS.taxDeposits, money(input.amount)),
        createdBy: actor.id,
      };
      await tx
        .insert(taxDeposits)
        .values({ tenantId: currentTenantId(), runId, ...values })
        .onConflictDoUpdate({ target: [taxDeposits.tenantId, taxDeposits.runId], set: values });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.tax.deposit',
        entityType: 'payroll_run',
        entityId: runId,
        after: { challanNo: input.challanNo, depositedOn: input.depositedOn },
      });
    });
    return this.runTax(runId);
  }

  /** A run's tax: what it deducted in all and the challan that deposited it. */
  runTax(runId: string) {
    return this.tenantDb.run(async (tx) => {
      const { open } = sealed(this.cipher);
      const items = await tx
        .select({ resultEnc: payrollRunItems.resultEnc })
        .from(payrollRunItems)
        .where(and(eq(payrollRunItems.runId, runId), eq(payrollRunItems.status, 'ok')));
      let total = new Decimal(0);
      let people = 0;
      for (const item of items) {
        const tax = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc).lines.find(
          (l) => l.code === 'TAX',
        );
        if (!tax) continue;
        total = total.plus(tax.amount);
        people += 1;
      }
      const [deposit] = await tx.select().from(taxDeposits).where(eq(taxDeposits.runId, runId));
      return {
        tax: money(total),
        people,
        deposit: deposit
          ? {
              challanNo: deposit.challanNo,
              depositedOn: deposit.depositedOn,
              amount: money(open<string>(CIPHER_FIELDS.taxDeposits, deposit.amountEnc)),
            }
          : null,
      };
    });
  }

  // ── The year ───────────────────────────────────────────────────────────────

  year(employeeId: string, fiscalYear?: string): Promise<TaxYearView> {
    return this.tenantDb.run(async (tx) =>
      this.yearOf(tx, await this.employee(tx, employeeId), fiscalYear ?? thisYear()),
    );
  }

  myYear(user: AuthUser, fiscalYear?: string): Promise<TaxYearView> {
    return this.tenantDb.run(async (tx) =>
      this.yearOf(tx, await this.me(tx, user), fiscalYear ?? thisYear()),
    );
  }

  /** The salary certificate for the year, for HR or for the employee's own. */
  async certificate(
    employeeId: string | null,
    fiscalYear: string,
    language: 'en' | 'bn',
    viewer: AuthUser,
  ) {
    const html = await this.tenantDb.run(async (tx) => {
      const employee = employeeId ? await this.employee(tx, employeeId) : await this.me(tx, viewer);
      const year = await this.yearOf(tx, employee, fiscalYear);
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
            eq(jobAssignments.employeeId, employee.id),
            lte(jobAssignments.effectiveFrom, fiscalYearBounds(fiscalYear).end),
          ),
        )
        .orderBy(desc(jobAssignments.effectiveFrom))
        .limit(1);
      const entity = job?.entity;
      return certificateHtml({
        language,
        fiscalYear,
        company: {
          name: entity?.legalName ?? entity?.name ?? '',
          details: entity?.address ? formatAddress(entity.address, language) : '',
          tin: entity?.tin ?? null,
        },
        employee: {
          code: employee.employeeCode,
          name: language === 'bn' && employee.fullNameBn ? employee.fullNameBn : employee.fullName,
          tin: year.employee.tin,
          designation: (language === 'bn' ? job?.designationBn : null) ?? job?.designation ?? null,
        },
        opening: year.opening,
        months: year.months.map((m) => ({
          periodStart: m.month,
          periodEnd: m.periodEnd,
          kind: m.kind,
          salary: m.salary,
          tax: m.tax,
          challanNo: m.challanNo,
          depositedOn: m.depositedOn,
        })),
        salary: year.salary,
        tax: year.tax,
        issuedOn: todayIn(),
      });
    });
    return {
      bytes: await this.pdf.render(html),
      fileName: `salary-certificate-${fiscalYear}-${language}.pdf`,
    };
  }

  /**
   * A quarter of the income year for the withholding return (s.177, due 25 October, January,
   * April and July): each person's salary and tax deducted by the quarter's locked runs, with
   * the challans that deposited it.
   */
  quarterStatement(fiscalYear: string, quarter: 1 | 2 | 3 | 4): Promise<string> {
    return this.tenantDb.run(async (tx) => {
      const { open } = sealed(this.cipher);
      const components = await componentsOf(tx);
      const { start } = fiscalYearBounds(fiscalYear);
      const [y, m] = start.split('-').map(Number) as [number, number];
      const from = new Date(Date.UTC(y, m - 1 + (quarter - 1) * 3, 1)).toISOString().slice(0, 10);
      const to = new Date(Date.UTC(y, m - 1 + quarter * 3, 0)).toISOString().slice(0, 10);
      const items = await tx
        .select({ item: payrollRunItems, employee: employees, deposit: taxDeposits })
        .from(payrollRunItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
        .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
        .leftJoin(taxDeposits, eq(taxDeposits.runId, payrollRuns.id))
        .where(
          and(
            eq(payrollRuns.status, 'locked'),
            eq(payrollRunItems.status, 'ok'),
            gte(payrollRuns.periodStart, from),
            lte(payrollRuns.periodStart, to),
          ),
        )
        .orderBy(asc(employees.employeeCode), asc(payrollRuns.periodStart));
      const rows = new Map<
        string,
        { e: Employee; salary: Decimal; tax: Decimal; challans: Set<string> }
      >();
      for (const { item, employee, deposit } of items) {
        const { lines } = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc);
        const tax = new Decimal(lines.find((l) => l.code === 'TAX')?.amount ?? 0);
        const r = rows.get(employee.id) ?? {
          e: employee,
          salary: new Decimal(0),
          tax: new Decimal(0),
          challans: new Set<string>(),
        };
        r.salary = r.salary.plus(salaryIn(lines, components));
        r.tax = r.tax.plus(tax);
        if (deposit && tax.greaterThan(0))
          r.challans.add(`${deposit.challanNo} (${deposit.depositedOn})`);
        rows.set(employee.id, r);
      }
      const out = ['Employee code,Name,TIN,Salary,Tax deducted,Challans'];
      for (const { e, salary, tax, challans } of rows.values()) {
        const tin = e.tinEnc
          ? this.cipher.decrypt(e.tinEnc, { tenantId: currentTenantId(), field: CIPHER_FIELDS.tin })
          : '';
        out.push(
          [e.employeeCode, e.fullName, tin, money(salary), money(tax), [...challans].join('; ')]
            .map(csv)
            .join(','),
        );
      }
      return `${out.join('\n')}\n`;
    });
  }

  /** Everyone's salary and tax for the year, as CSV for the employer's withholding return. */
  register(fiscalYear: string): Promise<string> {
    return this.tenantDb.run(async (tx) => {
      const { open } = sealed(this.cipher);
      const components = await componentsOf(tx);
      const bounds = fiscalYearBounds(fiscalYear);
      const items = await tx
        .select({ item: payrollRunItems, employee: employees })
        .from(payrollRunItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
        .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
        .where(
          and(
            eq(payrollRuns.status, 'locked'),
            eq(payrollRunItems.status, 'ok'),
            gte(payrollRuns.periodStart, bounds.start),
            lte(payrollRuns.periodStart, bounds.end),
          ),
        )
        .orderBy(asc(employees.employeeCode));
      const rows = new Map<string, { e: Employee; salary: Decimal; tax: Decimal }>();
      for (const { item, employee } of items) {
        const { lines } = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc);
        const r = rows.get(employee.id) ?? {
          e: employee,
          salary: new Decimal(0),
          tax: new Decimal(0),
        };
        r.salary = r.salary.plus(salaryIn(lines, components));
        r.tax = r.tax.plus(lines.find((l) => l.code === 'TAX')?.amount ?? 0);
        rows.set(employee.id, r);
      }
      const out = ['Employee code,Name,TIN,Salary,Tax deducted'];
      for (const { e, salary, tax } of rows.values()) {
        const tin = e.tinEnc
          ? this.cipher.decrypt(e.tinEnc, { tenantId: currentTenantId(), field: CIPHER_FIELDS.tin })
          : '';
        out.push([e.employeeCode, e.fullName, tin, money(salary), money(tax)].map(csv).join(','));
      }
      return `${out.join('\n')}\n`;
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async employee(tx: Tx, id: string): Promise<Employee> {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, id));
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async me(tx: Tx, user: AuthUser): Promise<Employee> {
    const me = await employeeOfUser(tx, user.id);
    if (!me) throw new NotFoundException('Your login is not linked to an employee');
    return me;
  }

  private async profileOf(tx: Tx, employeeId: string): Promise<TaxProfileView> {
    const [p] = await tx.select().from(taxProfiles).where(eq(taxProfiles.employeeId, employeeId));
    return {
      disabled: p?.disabled ?? false,
      freedomFighter: p?.freedomFighter ?? false,
      disabledDependants: p?.disabledDependants ?? 0,
      area: p?.area ?? null,
    };
  }

  private async declarationOf(
    tx: Tx,
    employee: Employee,
    fiscalYear: string,
  ): Promise<TaxDeclarationView> {
    const { open } = sealed(this.cipher);
    const [row] = await tx
      .select()
      .from(taxDeclarations)
      .where(
        and(
          eq(taxDeclarations.employeeId, employee.id),
          eq(taxDeclarations.fiscalYear, fiscalYear),
        ),
      );
    const items = row ? open<DeclarationItem[]>(CIPHER_FIELDS.taxDeclarations, row.itemsEnc) : [];
    const sum = (pick: (i: DeclarationItem) => string | null) =>
      money(items.reduce((s, i) => s.plus(pick(i) ?? 0), new Decimal(0)));
    return {
      id: row?.id ?? null,
      employee: employeeRef(employee),
      fiscalYear,
      status: row?.status ?? null,
      items,
      declared: sum((i) => i.declared),
      verified: row?.status === 'verified' ? sum((i) => i.verified) : null,
      submittedAt: row?.submittedAt?.toISOString() ?? null,
      verifiedBy: row?.verifiedBy
        ? ((
            await tx
              .select({ name: tenantUsers.name })
              .from(tenantUsers)
              .where(eq(tenantUsers.id, row.verifiedBy))
          )[0]?.name ?? null)
        : null,
      verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    };
  }

  private async yearOf(tx: Tx, employee: Employee, fiscalYear: string): Promise<TaxYearView> {
    const { open } = sealed(this.cipher);
    const components = await componentsOf(tx);
    const bounds = fiscalYearBounds(fiscalYear);
    const items = await tx
      .select({ item: payrollRunItems, run: payrollRuns })
      .from(payrollRunItems)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
      .where(
        and(
          eq(payrollRunItems.employeeId, employee.id),
          eq(payrollRunItems.status, 'ok'),
          eq(payrollRuns.status, 'locked'),
          gte(payrollRuns.periodStart, bounds.start),
          lte(payrollRuns.periodStart, bounds.end),
        ),
      )
      .orderBy(asc(payrollRuns.periodStart), asc(payrollRuns.lockedAt));
    const deposits = items.length
      ? await tx
          .select()
          .from(taxDeposits)
          .where(
            inArray(
              taxDeposits.runId,
              items.map((i) => i.run.id),
            ),
          )
      : [];
    let salary = new Decimal(0);
    let tax = new Decimal(0);
    let latest: RunTaxWorking | null = null;
    const months = items.map(({ item, run }) => {
      const result = open<StoredResult & { tax?: RunTaxWorking | null }>(
        CIPHER_FIELDS.runResults,
        item.resultEnc,
      );
      const s = salaryIn(result.lines, components);
      const t = new Decimal(result.lines.find((l) => l.code === 'TAX')?.amount ?? 0);
      salary = salary.plus(s);
      tax = tax.plus(t);
      if (run.kind === 'regular' && result.tax) latest = result.tax;
      const deposit = deposits.find((d) => d.runId === run.id);
      return {
        month: run.periodStart,
        periodEnd: run.periodEnd,
        runId: run.id,
        kind: run.kind,
        salary: money(s),
        tax: money(t),
        challanNo: deposit?.challanNo ?? null,
        depositedOn: deposit?.depositedOn ?? null,
      };
    });
    const [openingRow] = await tx
      .select()
      .from(taxOpenings)
      .where(and(eq(taxOpenings.employeeId, employee.id), eq(taxOpenings.fiscalYear, fiscalYear)));
    const opening = openingRow
      ? open<{ salary: string; tax: string; pf: string }>(
          CIPHER_FIELDS.taxOpenings,
          openingRow.amountsEnc,
        )
      : null;
    if (opening) {
      salary = salary.plus(opening.salary);
      tax = tax.plus(opening.tax);
    }
    return {
      fiscalYear,
      employee: {
        ...employeeRef(employee),
        tin: employee.tinEnc
          ? this.cipher.decrypt(employee.tinEnc, {
              tenantId: currentTenantId(),
              field: CIPHER_FIELDS.tin,
            })
          : null,
      },
      profile: await this.profileOf(tx, employee.id),
      months,
      opening,
      salary: money(salary),
      tax: money(tax),
      latest,
      declaration: await this.declarationOf(tx, employee, fiscalYear),
    };
  }
}

const thisYear = () => fiscalYearOf(todayIn());

const csv = csvField;
