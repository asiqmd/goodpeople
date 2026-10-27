import { Injectable, NotFoundException } from '@nestjs/common';
import { employees, orgUnits, productionEntries, productionOperations, type Tx } from '@gp/db';
import {
  groupBy,
  MAX_PRODUCTION_IMPORT_ROWS,
  todayIn,
  type ProductionBatchInput,
  type ProductionBatchResult,
  type ProductionDayQuery,
  type ProductionDayView,
  type ProductionImportResult,
  type ProductionSource,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { readSheet, unreadableSheet } from '../../common/sheets.js';
import { TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeesInUnits, unitAndBelow } from '../employees/employee.queries.js';
import { csv } from '../payroll/disbursement.js';
import { jobsOn } from '../payroll/run-context.js';
import {
  checkRows,
  entryKey,
  planChanges,
  problemOf,
  type Entry,
  type LockedPeriod,
} from './production-changes.js';
import {
  isProductionHeading,
  productionColumns,
  sheetRows,
  TEMPLATE_HEADINGS,
} from './production-sheet.js';
import { lockedPeriods, reopenRunsFor, toOperationView, unitRefs } from './production.queries.js';

type Upload = { buffer: Buffer; originalname: string; size: number };
type EntryRow = typeof productionEntries.$inferSelect;

/** Excel reads a CSV as UTF-8, Bangla names included, only when it starts with a BOM. */
export const BOM = '﻿';

/**
 * What workers made, day by day: entered for a line on the factory floor, or imported from
 * a sheet. Entries copy their operation's rates, so pay already earned never changes with a
 * rate. Days whose pay is locked in payroll cannot change.
 */
@Injectable()
export class ProductionEntriesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  /** A line and the units below it on a day: who was employed there, and their pieces. */
  day(query: ProductionDayQuery): Promise<ProductionDayView> {
    return this.tenantDb.run(async (tx) => {
      const [unit] = await tx
        .select({
          id: orgUnits.id,
          code: orgUnits.code,
          name: orgUnits.name,
          nameBn: orgUnits.nameBn,
        })
        .from(orgUnits)
        .where(eq(orgUnits.id, query.orgUnitId));
      if (!unit) throw new NotFoundException('Unit not found');
      const units = await unitAndBelow(tx, unit.id);
      // Whoever has a job there that day, and anyone already entered there that day.
      const enteredThere = tx
        .select({ id: productionEntries.employeeId })
        .from(productionEntries)
        .where(
          and(eq(productionEntries.date, query.date), inArray(productionEntries.orgUnitId, units)),
        );
      const people = await tx
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          fullNameBn: employees.fullNameBn,
        })
        .from(employees)
        .where(
          and(
            or(
              inArray(employees.id, employeesInUnits(tx, units, query.date)),
              inArray(employees.id, enteredThere),
            ),
            lte(employees.joinedOn, query.date),
            or(isNull(employees.separatedOn), gte(employees.separatedOn, query.date)),
          ),
        )
        .orderBy(asc(employees.employeeCode));
      const ids = people.map((p) => p.id);
      const jobs = await jobsOn(tx, ids, query.date);
      const entries = ids.length
        ? await tx
            .select()
            .from(productionEntries)
            .where(
              and(
                eq(productionEntries.date, query.date),
                inArray(productionEntries.employeeId, ids),
              ),
            )
        : [];
      const used = [...new Set(entries.map((e) => e.operationId))];
      const operations = await tx
        .select()
        .from(productionOperations)
        .where(
          or(
            eq(productionOperations.isActive, true),
            used.length ? inArray(productionOperations.id, used) : undefined,
          ),
        )
        .orderBy(asc(productionOperations.code), asc(productionOperations.style));
      const locked = await lockedPeriods(tx, ids, query.date, query.date);
      const lines = await unitRefs(
        tx,
        people.map((p) => jobs.get(p.id)?.orgUnitId ?? null),
      );
      const byPerson = groupBy(entries, (e) => e.employeeId);
      return {
        date: query.date,
        orgUnit: unit,
        operations: operations.map(toOperationView),
        workers: people.map((p) => {
          const job = jobs.get(p.id);
          return {
            employee: employeeRef(p),
            designation: job?.designation ?? null,
            designationBn: job?.designationBn ?? null,
            orgUnit: (job?.orgUnitId && lines.get(job.orgUnitId)) || null,
            locked: !!locked.get(p.id)?.length,
            quantities: Object.fromEntries(
              (byPerson.get(p.id) ?? []).map((e) => [e.operationId, e.quantity]),
            ),
          };
        }),
      };
    });
  }

  /** One operation's pieces for some workers on a day; zero or empty removes an entry. */
  saveBatch(actor: AuthUser, input: ProductionBatchInput): Promise<ProductionBatchResult> {
    if (input.date > todayIn()) {
      throw badRequest('production_future_date', 'Production cannot be entered for a future day');
    }
    return this.tenantDb.run(async (tx) => {
      const [operation] = await tx
        .select()
        .from(productionOperations)
        .where(eq(productionOperations.id, input.operationId));
      if (!operation) throw new NotFoundException('Operation not found');
      const ids = input.entries.map((e) => e.employeeId);
      const people = await tx
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          joinedOn: employees.joinedOn,
          separatedOn: employees.separatedOn,
        })
        .from(employees)
        .where(inArray(employees.id, ids));
      if (people.length !== new Set(ids).size) {
        throw badRequest(
          'production_employee_unknown',
          'Someone in the list is not an employee here',
        );
      }
      const away = people.filter(
        (p) => p.joinedOn > input.date || (p.separatedOn !== null && p.separatedOn < input.date),
      );
      if (away.length) {
        throw badRequest(
          'not_employed_on_date',
          `Not employed on ${input.date}: ${away.map((p) => p.employeeCode).join(', ')}`,
        );
      }
      const entries: Entry[] = input.entries.map((e) => ({
        employeeId: e.employeeId,
        operationId: operation.id,
        date: input.date,
        quantity: e.quantity,
      }));
      const existing = await this.existingOf(tx, entries);
      const plan = planChanges(entries, {
        existing: new Map([...existing].map(([k, row]) => [k, row.quantity])),
        locked: await lockedPeriods(tx, ids, input.date, input.date),
        inactive: new Set(operation.isActive ? [] : [operation.id]),
      });
      const codeOf = new Map(people.map((p) => [p.id, p.employeeCode]));
      const refusedCodes = (code: string) =>
        plan.refused
          .filter((r) => r.code === code)
          .map((r) => codeOf.get(r.entry.employeeId))
          .join(', ');
      if (plan.refused.some((r) => r.code === 'payroll_locked')) {
        throw conflict(
          'payroll_locked',
          `Pay for ${input.date} is locked in payroll for ${refusedCodes('payroll_locked')}`,
        );
      }
      if (plan.refused.length) {
        throw conflict('operation_inactive', `${operation.code} is no longer in use`);
      }
      await this.apply(tx, actor, plan, new Map([[operation.id, operation]]), 'manual');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'production.entries.save',
        entityType: 'production_operation',
        entityId: operation.id,
        before: {
          date: input.date,
          entries: [...plan.upserts, ...plan.removals]
            .filter((e) => existing.has(entryKey(e)))
            .map((e) => ({
              employeeId: e.employeeId,
              quantity: existing.get(entryKey(e))!.quantity,
            })),
        },
        after: {
          date: input.date,
          entries: [...plan.upserts, ...plan.removals].map((e) => ({
            employeeId: e.employeeId,
            quantity: e.quantity,
          })),
        },
      });
      return {
        saved: plan.upserts.length,
        removed: plan.removals.length,
        unchanged: plan.unchanged.length,
      };
    });
  }

  /**
   * A sheet of employee code, date, operation code and pieces (.xlsx or .csv). The rows that
   * can be saved are; every other row comes back with why not.
   */
  async import(actor: AuthUser, file: Upload | undefined): Promise<ProductionImportResult> {
    if (!file) throw badRequest('production_file_required', 'Choose the production sheet');
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) {
      throw badRequest('sheet_type', 'Upload the sheet as .xlsx or .csv');
    }
    const sheet = await readSheet(file, isProductionHeading).catch(unreadableSheet);
    const at = productionColumns(sheet.headers);
    if (Object.values(at).some((i) => i < 0)) {
      throw badRequest(
        'production_import_columns',
        'The sheet needs employee code, date, operation code and quantity columns',
      );
    }
    if (sheet.rows.length === 0) {
      throw badRequest('sheet_empty', 'The sheet has no rows under its headings');
    }
    if (sheet.rows.length > MAX_PRODUCTION_IMPORT_ROWS) {
      throw badRequest(
        'production_import_too_large',
        `Import at most ${MAX_PRODUCTION_IMPORT_ROWS} rows at a time`,
      );
    }
    const rows = sheetRows(sheet, at);
    return this.tenantDb.run(async (tx) => {
      const people = await tx
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          joinedOn: employees.joinedOn,
          separatedOn: employees.separatedOn,
        })
        .from(employees)
        .where(
          inArray(sql`upper(${employees.employeeCode})`, [
            ...new Set(rows.map((r) => r.employeeCode.toUpperCase())),
          ]),
        );
      const exact = new Map(people.map((p) => [p.employeeCode, p]));
      const loose = new Map(people.map((p) => [p.employeeCode.toUpperCase(), p]));
      const operations = await tx.select().from(productionOperations);
      const byCode = new Map(operations.map((o) => [o.code, o]));
      const checked = checkRows(rows, {
        today: todayIn(),
        employee: (code) => exact.get(code) ?? loose.get(code.toUpperCase()) ?? null,
        operation: (code) => byCode.get(code.toUpperCase()) ?? null,
      });
      const dates = checked.entries.map((e) => e.date).toSorted();
      const existing = await this.existingOf(tx, checked.entries);
      const plan = planChanges(checked.entries, {
        existing: new Map([...existing].map(([k, row]) => [k, row.quantity])),
        locked: dates.length
          ? await lockedPeriods(
              tx,
              [...new Set(checked.entries.map((e) => e.employeeId))],
              dates[0]!,
              dates.at(-1)!,
            )
          : new Map<string, LockedPeriod[]>(),
        inactive: new Set(operations.filter((o) => !o.isActive).map((o) => o.id)),
      });
      const problems = [
        ...checked.problems,
        ...plan.refused.map((r) => problemOf(r.entry.source, r.code)),
      ].toSorted((a, b) => a.row - b.row);
      await this.apply(tx, actor, plan, new Map(operations.map((o) => [o.id, o])), 'import');
      const result: ProductionImportResult = {
        fileName: file.originalname.slice(0, 200),
        rows: rows.length,
        saved: plan.upserts.length,
        removed: plan.removals.length,
        unchanged: plan.unchanged.length,
        problems,
      };
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'production.entries.import',
        entityType: 'production_import',
        entityId: null,
        after: { ...result, problems: problems.length },
      });
      return result;
    });
  }

  /** The import template: its headings only, so nothing in it is saved by mistake. */
  template(): { text: string; fileName: string } {
    return { text: BOM + csv([TEMPLATE_HEADINGS]), fileName: 'production-import.csv' };
  }

  /** The entries these would replace, by key. */
  private async existingOf(tx: Tx, entries: Entry[]): Promise<Map<string, EntryRow>> {
    const out = new Map<string, EntryRow>();
    if (entries.length === 0) return out;
    const dates = entries.map((e) => e.date).toSorted();
    const people = [...new Set(entries.map((e) => e.employeeId))];
    for (let i = 0; i < people.length; i += 5000) {
      const rows = await tx
        .select()
        .from(productionEntries)
        .where(
          and(
            inArray(productionEntries.employeeId, people.slice(i, i + 5000)),
            gte(productionEntries.date, dates[0]!),
            lte(productionEntries.date, dates.at(-1)!),
          ),
        );
      for (const row of rows) out.set(entryKey(row), row);
    }
    return out;
  }

  /**
   * Writes a plan: new entries copy their operation's rates, changed ones keep the rates
   * they were first entered with, and each is filed under the worker's unit on the day.
   */
  private async apply(
    tx: Tx,
    actor: AuthUser,
    plan: { upserts: Entry[]; removals: Entry[] },
    operations: Map<string, typeof productionOperations.$inferSelect>,
    source: ProductionSource,
  ) {
    await reopenRunsFor(tx, [...plan.upserts, ...plan.removals]);
    const values: (typeof productionEntries.$inferInsert)[] = [];
    for (const [date, list] of groupBy(plan.upserts, (e) => e.date)) {
      const jobs = await jobsOn(
        tx,
        list.map((e) => e.employeeId),
        date,
      );
      for (const e of list) {
        const operation = operations.get(e.operationId)!;
        values.push({
          tenantId: currentTenantId(),
          employeeId: e.employeeId,
          operationId: e.operationId,
          date: e.date,
          quantity: e.quantity,
          pieceRate: operation.pieceRate,
          dailyTarget: operation.dailyTarget,
          incentiveRate: operation.incentiveRate,
          orgUnitId: jobs.get(e.employeeId)?.orgUnitId ?? null,
          source,
          enteredBy: actor.id,
        });
      }
    }
    for (let i = 0; i < values.length; i += 1000) {
      await tx
        .insert(productionEntries)
        .values(values.slice(i, i + 1000))
        .onConflictDoUpdate({
          target: [
            productionEntries.tenantId,
            productionEntries.employeeId,
            productionEntries.date,
            productionEntries.operationId,
          ],
          set: {
            quantity: sql`excluded.quantity`,
            orgUnitId: sql`excluded.org_unit_id`,
            source: sql`excluded.source`,
            enteredBy: sql`excluded.entered_by`,
            updatedAt: new Date(),
          },
        });
    }
    for (const [date, list] of groupBy(plan.removals, (e) => e.date)) {
      for (const [operationId, ofOperation] of groupBy(list, (e) => e.operationId)) {
        await tx.delete(productionEntries).where(
          and(
            eq(productionEntries.date, date),
            eq(productionEntries.operationId, operationId),
            inArray(
              productionEntries.employeeId,
              ofOperation.map((e) => e.employeeId),
            ),
          ),
        );
      }
    }
  }
}
