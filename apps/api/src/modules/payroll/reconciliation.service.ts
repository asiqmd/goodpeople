import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  employees,
  payGroups,
  payrollReconciliations,
  payrollRunItems,
  payrollRuns,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  RECONCILE_TOTALS,
  type PayLineView,
  type ParallelRunsView,
  type ReconciliationListItem,
  type ReconciliationMapping,
  type ReconciliationView,
  type RunVariables,
} from '@gp/shared';
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { readSheet, unreadableSheet } from '../../common/sheets.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { csv } from './disbursement.js';
import { componentsOf } from './payroll-setup.service.js';
import {
  compareSheet,
  isHeading,
  matchedInARow,
  suggestMapping,
  type Comparison,
  type OurPerson,
} from './reconciliation.js';
import { sealed } from './run-context.js';

type Row = typeof payrollReconciliations.$inferSelect;
type Upload = { buffer: Buffer; originalname: string; size: number };

/** Consecutive matched months the go-live checklist asks for. */
export const PARALLEL_MONTHS_REQUIRED = 3;
const SHOWN = 500;
const TOTAL_LABELS: Record<string, string> = {
  GROSS: 'Gross',
  EARNINGS: 'Total earnings',
  DEDUCTIONS: 'Total deductions',
  NET: 'Net pay',
  PAID_DAYS: 'Paid days',
  ABSENT_DAYS: 'Absent days',
  OT_HOURS: 'Overtime hours',
};

/**
 * Parallel runs: the payroll a workspace still pays with, uploaded as a sheet and compared
 * with our run for the same month, person by person. Three months in a row that match to the
 * taka are the go-live test.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Reads the sheet and proposes a mapping; compares nothing yet. */
  async upload(
    actor: AuthUser,
    runId: string,
    file: Upload | undefined,
  ): Promise<ReconciliationView> {
    if (!file) throw badRequest('file_required', 'Choose the payroll sheet to compare');
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) {
      throw badRequest('sheet_type', 'Upload the sheet as .xlsx or .csv');
    }
    const sheet = await readSheet(file, isHeading).catch(unreadableSheet);
    if (sheet.rows.length === 0)
      throw badRequest('sheet_empty', 'The sheet has no rows under its headings');
    const id = await this.tenantDb.run(async (tx) => {
      const run = await this.runOf(tx, runId);
      if (run.status === 'draft' || run.status === 'cancelled') {
        throw conflict('run_not_computed', 'Compute the run before comparing it');
      }
      const [row] = await tx
        .insert(payrollReconciliations)
        .values({
          tenantId: currentTenantId(),
          runId,
          fileName: file.originalname.slice(0, 200),
          headers: sheet.headers,
          rowCount: sheet.rows.length,
          sheetEnc: sealed(this.cipher).seal(CIPHER_FIELDS.reconciliationSheet, sheet.rows),
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.reconciliation.upload',
        entityType: 'payroll_run',
        entityId: runId,
        after: { reconciliationId: row!.id, fileName: row!.fileName, rows: row!.rowCount },
      });
      return row!.id;
    });
    return this.view(id);
  }

  /** Compares with the mapping given; may be repeated with another mapping. */
  async compare(
    actor: AuthUser,
    id: string,
    mapping: ReconciliationMapping,
  ): Promise<ReconciliationView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.rowOf(tx, id);
      const components = await componentsOf(tx);
      const known = new Set<string>([...RECONCILE_TOTALS, ...components.map((c) => c.code)]);
      const headings = new Set(row.headers);
      const unknownHeading = [mapping.employeeCode, mapping.name, ...Object.values(mapping.columns)]
        .filter((h): h is string => h !== undefined)
        .find((h) => !headings.has(h));
      if (unknownHeading) {
        throw badRequest('mapping_unknown_column', `The sheet has no column "${unknownHeading}"`);
      }
      const unknownKey = Object.keys(mapping.columns).find((k) => !known.has(k));
      if (unknownKey)
        throw badRequest('mapping_unknown_key', `There is no component ${unknownKey}`);
      if (Object.keys(mapping.columns).length === 0) {
        throw badRequest('mapping_empty', 'Choose at least one column to compare');
      }
      const ours = await this.ourPeople(tx, row.runId);
      const { open, seal } = sealed(this.cipher);
      const rows = open<string[][]>(CIPHER_FIELDS.reconciliationSheet, row.sheetEnc);
      const names = new Map(components.map((c) => [c.code, c.name]));
      const result = compareSheet(
        { headers: row.headers, rows },
        mapping,
        ours,
        (key) => TOTAL_LABELS[key] ?? names.get(key) ?? key,
      );
      const { summary } = result;
      const status =
        summary.differing + summary.onlyOurs + summary.onlyTheirs === 0 ? 'matched' : 'differences';
      await tx
        .update(payrollReconciliations)
        .set({
          mapping,
          status,
          summary,
          resultEnc: seal(CIPHER_FIELDS.reconciliationResult, {
            columns: result.columns,
            differences: result.differences,
          }),
          comparedBy: actor.id,
          comparedAt: new Date(),
        })
        .where(eq(payrollReconciliations.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.reconciliation.compare',
        entityType: 'payroll_run',
        entityId: row.runId,
        after: { reconciliationId: id, status, ...summary },
      });
    });
    return this.view(id);
  }

  list(runId: string): Promise<ReconciliationListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select()
        .from(payrollReconciliations)
        .where(eq(payrollReconciliations.runId, runId))
        .orderBy(desc(payrollReconciliations.createdAt));
      return rows.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        status: r.status,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
        comparedAt: r.comparedAt?.toISOString() ?? null,
      }));
    });
  }

  view(id: string): Promise<ReconciliationView> {
    return this.tenantDb.run(async (tx) => {
      const row = await this.rowOf(tx, id);
      const result = row.resultEnc
        ? sealed(this.cipher).open<Omit<Comparison, 'summary'>>(
            CIPHER_FIELDS.reconciliationResult,
            row.resultEnc,
          )
        : null;
      return {
        id: row.id,
        runId: row.runId,
        fileName: row.fileName,
        status: row.status,
        headers: row.headers,
        rows: row.rowCount,
        mapping: row.mapping ?? (await this.proposed(tx, row)),
        summary: row.summary,
        columns: result?.columns ?? [],
        differences: result?.differences.slice(0, SHOWN) ?? [],
        createdAt: row.createdAt.toISOString(),
        comparedAt: row.comparedAt?.toISOString() ?? null,
      };
    });
  }

  /** Every difference as CSV, one line per person and column. */
  differencesCsv(id: string): Promise<{ text: string; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const row = await this.rowOf(tx, id);
      if (!row.resultEnc) throw conflict('not_compared', 'Compare the sheet first');
      const result = sealed(this.cipher).open<Omit<Comparison, 'summary'>>(
        CIPHER_FIELDS.reconciliationResult,
        row.resultEnc,
      );
      const label = new Map(result.columns.map((c) => [c.key, c.label]));
      return {
        text: csv([
          ['Employee code', 'Name', 'Status', 'Column', 'Ours', 'Theirs', 'Difference'],
          ...result.differences.flatMap((d) =>
            d.lines.map((l) => [
              d.employeeCode,
              d.name ?? '',
              d.status,
              label.get(l.key) ?? l.key,
              l.ours ?? '',
              l.theirs ?? '',
              l.difference,
            ]),
          ),
        ]),
        fileName: `reconciliation-${row.createdAt.toISOString().slice(0, 10)}.csv`,
      };
    });
  }

  parallelRuns(): Promise<ParallelRunsView> {
    return this.tenantDb.run((tx) => parallelRunsOf(tx));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async runOf(tx: Tx, runId: string) {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  private async rowOf(tx: Tx, id: string): Promise<Row> {
    const [row] = await tx
      .select()
      .from(payrollReconciliations)
      .where(eq(payrollReconciliations.id, id));
    if (!row) throw new NotFoundException('Reconciliation not found');
    return row;
  }

  /** The mapping to propose: the workspace's last one where it still fits, else a guess. */
  private async proposed(tx: Tx, row: Row): Promise<ReconciliationMapping> {
    const [last] = await tx
      .select({ mapping: payrollReconciliations.mapping })
      .from(payrollReconciliations)
      .where(and(isNotNull(payrollReconciliations.mapping), ne(payrollReconciliations.id, row.id)))
      .orderBy(desc(payrollReconciliations.comparedAt))
      .limit(1);
    return suggestMapping(row.headers, await componentsOf(tx), last?.mapping ?? null);
  }

  /** Each person in the run with their amounts by component and the run's totals. */
  private async ourPeople(tx: Tx, runId: string): Promise<OurPerson[]> {
    const { open } = sealed(this.cipher);
    const components = await componentsOf(tx);
    const inGross = new Set(components.filter((c) => c.inGross).map((c) => c.code));
    const items = await tx
      .select({ item: payrollRunItems, employee: employees })
      .from(payrollRunItems)
      .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
      .where(eq(payrollRunItems.runId, runId))
      .orderBy(asc(employees.employeeCode));
    return items.map(({ item, employee }) => {
      const r = open<{
        lines: PayLineView[];
        earnings: string;
        deductions: string;
        net: string;
        variables: RunVariables;
      }>(CIPHER_FIELDS.runResults, item.resultEnc);
      const values = new Map<string, Decimal>();
      for (const l of r.lines) {
        values.set(l.code, (values.get(l.code) ?? new Decimal(0)).plus(l.amount));
      }
      const gross = r.lines
        .filter((l) => l.kind === 'earning' && inGross.has(l.code))
        .reduce((s, l) => s.plus(l.amount), new Decimal(0));
      values.set('GROSS', gross);
      values.set('EARNINGS', new Decimal(r.earnings));
      values.set('DEDUCTIONS', new Decimal(r.deductions));
      values.set('NET', new Decimal(r.net));
      values.set('PAID_DAYS', new Decimal(r.variables.paidDays));
      values.set('ABSENT_DAYS', new Decimal(r.variables.absentDays));
      values.set('OT_HOURS', new Decimal(r.variables.otHours));
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.fullName,
        values,
      };
    });
  }
}

/**
 * The months with a regular run, newest first, each with its latest comparison; months
 * count towards go-live while every pay group's run in them matched, in a row.
 */
export async function parallelRunsOf(tx: Tx): Promise<ParallelRunsView> {
  const runs = await tx
    .select({ run: payrollRuns, group: payGroups.name })
    .from(payrollRuns)
    .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
    .where(
      and(
        eq(payrollRuns.kind, 'regular'),
        inArray(payrollRuns.status, ['computed', 'pending', 'locked']),
      ),
    )
    .orderBy(desc(payrollRuns.periodStart), asc(payGroups.name));
  const compared = runs.length
    ? await tx
        .select()
        .from(payrollReconciliations)
        .where(
          and(
            inArray(
              payrollReconciliations.runId,
              runs.map((r) => r.run.id),
            ),
            isNotNull(payrollReconciliations.comparedAt),
          ),
        )
        .orderBy(desc(payrollReconciliations.comparedAt))
    : [];
  const latest = new Map<string, Row>();
  for (const r of compared) if (!latest.has(r.runId)) latest.set(r.runId, r);
  const months = runs.map(({ run, group }) => ({
    period: run.periodStart.slice(0, 7),
    payGroup: group,
    runId: run.id,
    status: latest.get(run.id)?.status ?? null,
    reconciliationId: latest.get(run.id)?.id ?? null,
  }));
  const consecutive = matchedInARow(months);
  return { required: PARALLEL_MONTHS_REQUIRED, consecutive, months };
}
