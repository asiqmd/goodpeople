import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalSteps,
  CIPHER_FIELDS,
  employeePay,
  employees,
  payBatches,
  salaryStructures,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  money,
  type ApprovalItem,
  type PayBatchInput,
  type PayBatchLine,
  type PayBatchPreview,
  type PayBatchView,
} from '@gp/shared';
import { and, desc, eq, inArray, isNotNull, ne, type SQL } from 'drizzle-orm';
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
import { localDate, NotificationsService } from '../notifications/notifications.service.js';
import { workOutPay, type ComponentInfo, type StructureInfo } from './pay-calc.js';
import { componentsOf, payrollSettingsOf } from './payroll-setup.service.js';
import { sealed } from './run-context.js';
import { completedMonths } from './run-engine.js';

const requester = alias(tenantUsers, 'batch_requester');
const decider = alias(tenantUsers, 'batch_decider');

interface Amounts {
  amount: string;
  fixed: Record<string, string>;
}

/** How many people the inbox shows before and after; the totals cover everyone. */
const SHOWN = 20;

/**
 * The amount (gross or basic, as the structure takes) that brings `line` to at least
 * `target`: the structure's lines only grow with the amount, so a binary search over whole
 * taka finds the smallest.
 */
export function amountFor(
  structure: StructureInfo,
  components: readonly ComponentInfo[],
  fixed: Record<string, string>,
  line: 'BASIC' | 'GROSS',
  target: Decimal,
): Decimal | null {
  const valueAt = (amount: number) => {
    const pay = workOutPay(structure, components, String(amount), fixed);
    if (pay.problems.length) return null;
    return new Decimal(
      line === 'GROSS' ? pay.gross : (pay.lines.find((l) => l.code === 'BASIC')?.amount ?? 0),
    );
  };
  let low = 0;
  // A valid structure may put much less than a quarter of gross in BASIC. Expand the
  // bracket rather than assuming target × 4 is enough; stay within the pay input limit.
  const maximum = 9_999_999_999;
  let high = Math.min(maximum, Math.max(1, target.times(4).ceil().toNumber()));
  let sufficient = valueAt(high)?.greaterThanOrEqualTo(target) ?? false;
  while (!sufficient) {
    if (high === maximum) return null;
    high = Math.min(maximum, high * 2);
    sufficient = valueAt(high)?.greaterThanOrEqualTo(target) ?? false;
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const value = valueAt(mid);
    // Fixed allowances can make low input amounts invalid. With the monotone pay
    // structure assumed here, those inputs are below the valid, sufficient bracket.
    if (value?.greaterThanOrEqualTo(target)) high = mid;
    else low = mid + 1;
  }
  return new Decimal(low);
}

/**
 * Pay changes for many people decided together: the annual increment, as a percentage of
 * basic (the RMG wage board's 5%) or of gross. A batch is previewed, proposed as one
 * approval, and on approval each person's new pay is approved from the date.
 */
@Injectable()
export class PayBatchesService implements ApprovalSubjectHandler<PayBatchView> {
  readonly auditPrefix = 'payroll.batch';
  readonly entityType = 'pay_batch' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(): Promise<PayBatchView[]> {
    return this.tenantDb.run((tx) => this.views(tx, undefined));
  }

  view(id: string): Promise<PayBatchView> {
    return this.tenantDb.run(async (tx) => {
      const [batch] = await this.views(tx, eq(payBatches.id, id));
      if (!batch) throw new NotFoundException('Batch not found');
      return batch;
    });
  }

  /** Who the increment would reach and their pay before and after; nothing is saved. */
  preview(input: PayBatchInput): Promise<PayBatchPreview> {
    return this.tenantDb.run(async (tx) => (await this.plan(tx, input)).preview);
  }

  async create(actor: AuthUser, input: PayBatchInput): Promise<PayBatchView> {
    const id = await this.tenantDb.run(async (tx) => {
      const [open] = await tx
        .select({ id: payBatches.id })
        .from(payBatches)
        .where(eq(payBatches.status, 'pending'));
      if (open) throw conflict('batch_pending', 'Another batch is waiting for approval');
      const { preview, records } = await this.plan(tx, input);
      if (records.length === 0) throw badRequest('batch_empty', 'Nobody would get this increment');
      const [batch] = await tx
        .insert(payBatches)
        .values({
          tenantId: currentTenantId(),
          effectiveFrom: input.effectiveFrom,
          basis: input.basis,
          percent: input.percent,
          people: records.length,
          reason: input.reason,
          requestedBy: actor.id,
        })
        .returning();
      for (let i = 0; i < records.length; i += 1000) {
        await tx.insert(employeePay).values(
          records.slice(i, i + 1000).map((r) => ({
            ...r,
            tenantId: currentTenantId(),
            batchId: batch!.id,
            effectiveFrom: input.effectiveFrom,
            status: 'pending' as const,
            reason: input.reason,
            requestedBy: actor.id,
          })),
        );
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.batch.create',
        entityType: 'pay_batch',
        entityId: batch!.id,
        after: {
          effectiveFrom: input.effectiveFrom,
          basis: input.basis,
          percent: input.percent,
          people: records.length,
          skipped: preview.skipped.length,
        },
      });
      const settings = await payrollSettingsOf(tx);
      if (settings.makerChecker) {
        await tx.insert(approvalSteps).values({
          tenantId: currentTenantId(),
          subjectType: 'pay_batch',
          subjectId: batch!.id,
          stepNo: 1,
          kind: 'payroll',
          status: 'pending',
        });
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'pay_batch', id: batch!.id },
          await this.summarize(tx, batch!.id),
        );
      } else {
        await this.finalize(tx, batch!.id, 'approved', actor.id);
      }
      return batch!.id;
    });
    return this.view(id);
  }

  cancel(actor: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const [batch] = await tx.select().from(payBatches).where(eq(payBatches.id, id)).for('update');
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status !== 'pending') {
        throw conflict('not_pending', `This batch is ${batch.status}, not waiting for approval`);
      }
      await tx.update(payBatches).set({ status: 'cancelled' }).where(eq(payBatches.id, id));
      await tx
        .update(employeePay)
        .set({ status: 'cancelled' })
        .where(and(eq(employeePay.batchId, id), eq(employeePay.status, 'pending')));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.batch.cancel',
        entityType: 'pay_batch',
        entityId: id,
      });
    });
  }

  // ── Approval handler ───────────────────────────────────────────────────────

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ madeBy: payBatches.requestedBy })
      .from(payBatches)
      .where(eq(payBatches.id, subjectId))
      .for('update');
    // A batch is nobody's own request.
    return row ? { employeeId: '', madeBy: row.madeBy } : null;
  }

  ownedBy(tx: Tx, who: Whose): SQL {
    // Nobody may approve a batch that changes their own pay. Without the null filter, a NOT IN
    // over this list would match nothing at all.
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: employeePay.batchId })
        .from(employeePay)
        .where(and(whose(employeePay.employeeId, who), isNotNull(employeePay.batchId))),
    );
  }

  madeBy(tx: Tx, userId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx.select({ id: payBatches.id }).from(payBatches).where(eq(payBatches.requestedBy, userId)),
    );
  }

  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    const [batch] = await tx
      .update(payBatches)
      .set({ status: outcome, decidedBy: actorUserId, decidedAt: new Date() })
      .where(eq(payBatches.id, subjectId))
      .returning();
    const decided = await tx
      .update(employeePay)
      .set({ status: outcome, decidedBy: actorUserId, decidedAt: new Date() })
      .where(and(eq(employeePay.batchId, subjectId), eq(employeePay.status, 'pending')))
      .returning({ id: employeePay.id, employeeId: employeePay.employeeId });
    if (outcome === 'approved' && decided.length) {
      // Pay approved from the same date is replaced by the increment.
      await tx
        .update(employeePay)
        .set({ status: 'superseded' })
        .where(
          and(
            inArray(
              employeePay.employeeId,
              decided.map((d) => d.employeeId),
            ),
            eq(employeePay.effectiveFrom, batch!.effectiveFrom),
            eq(employeePay.status, 'approved'),
            ne(employeePay.batchId, subjectId),
          ),
        );
    }
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const [batch] = await this.views(tx, eq(payBatches.id, step.subjectId));
      if (!batch) continue;
      items.push({
        sortKey: batch.effectiveFrom,
        item: {
          subjectType: 'pay_batch',
          stepId: step.id,
          kind: 'payroll',
          batch,
          preview: await this.previewOf(tx, batch.id, batch.effectiveFrom),
        },
      });
    }
    return items;
  }

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ batch: payBatches, requester: tenantUsers.name })
      .from(payBatches)
      .leftJoin(tenantUsers, eq(tenantUsers.id, payBatches.requestedBy))
      .where(eq(payBatches.id, subjectId));
    const batch = row!.batch;
    const date = localDate(batch.effectiveFrom);
    return {
      employeeId: '',
      personName: row!.requester ?? '',
      summary: {
        en: `Increment of ${batch.percent}% of ${batch.basis} for ${batch.people} people from ${date.en}`,
        bn: `${date.bn} থেকে ${batch.people} জনের ${batch.basis === 'basic' ? 'মূল বেতনের' : 'মোট বেতনের'} ${batch.percent}% বৃদ্ধি`,
      },
      link: '/workspace/payroll/increments',
      madeBy: batch.requestedBy,
      decisionRecipients: batch.requestedBy ? [{ userId: batch.requestedBy }] : [],
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Each eligible person's new pay record, and the preview of the whole batch. */
  private async plan(tx: Tx, input: PayBatchInput) {
    const { open, seal } = sealed(this.cipher);
    const components = await componentsOf(tx);
    const structures = new Map(
      (await tx.select().from(salaryStructures)).map((s) => [s.id, s] as const),
    );
    const people = await tx.select().from(employees).where(eq(employees.status, 'active'));
    const records = await tx
      .select()
      .from(employeePay)
      .where(inArray(employeePay.status, ['approved', 'pending']))
      .orderBy(desc(employeePay.effectiveFrom), desc(employeePay.createdAt));
    const byPerson = new Map<string, (typeof records)[number][]>();
    for (const r of records) byPerson.set(r.employeeId, [...(byPerson.get(r.employeeId) ?? []), r]);

    const lines: PayBatchLine[] = [];
    const skipped: PayBatchPreview['skipped'] = [];
    const inserts: Omit<
      typeof employeePay.$inferInsert,
      'tenantId' | 'effectiveFrom' | 'status' | 'reason'
    >[] = [];
    let grossBefore = new Decimal(0);
    let grossAfter = new Decimal(0);
    const skip = (
      e: typeof employees.$inferSelect,
      reason: PayBatchPreview['skipped'][number]['reason'],
    ) => skipped.push({ employee: employeeRef(e), reason });

    for (const e of people.toSorted((a, b) => a.employeeCode.localeCompare(b.employeeCode))) {
      const own = byPerson.get(e.id) ?? [];
      const latest = own.find((r) => r.status === 'approved');
      if (!latest) {
        skip(e, 'no_pay');
        continue;
      }
      if (input.payGroupIds && !input.payGroupIds.includes(latest.payGroupId)) continue;
      if (input.structureIds && !input.structureIds.includes(latest.structureId)) continue;
      if (own.some((r) => r.status === 'pending')) {
        skip(e, 'pending_change');
        continue;
      }
      if (latest.effectiveFrom > input.effectiveFrom) {
        skip(e, 'later_pay');
        continue;
      }
      if (completedMonths(e.joinedOn, input.effectiveFrom) < input.minServiceMonths) {
        skip(e, 'not_eligible');
        continue;
      }
      const structure = structures.get(latest.structureId)!;
      const amounts = open<Amounts>(CIPHER_FIELDS.payAmounts, latest.amountsEnc);
      const before = workOutPay(structure, components, amounts.amount, amounts.fixed);
      const basicBefore = new Decimal(before.lines.find((l) => l.code === 'BASIC')?.amount ?? 0);
      const raise = new Decimal(input.percent).dividedBy(100).plus(1);
      const target =
        input.basis === 'basic'
          ? basicBefore.times(raise).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          : new Decimal(before.gross).times(raise).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      const amount = amountFor(
        structure,
        components,
        amounts.fixed,
        input.basis === 'basic' ? 'BASIC' : 'GROSS',
        target,
      );
      if (!amount) {
        skip(e, 'not_eligible');
        continue;
      }
      const after = workOutPay(structure, components, amount.toString(), amounts.fixed);
      grossBefore = grossBefore.plus(before.gross);
      grossAfter = grossAfter.plus(after.gross);
      if (lines.length < SHOWN) {
        lines.push({
          employee: employeeRef(e),
          structure: structure.name,
          wageGrade: latest.wageGrade,
          basicBefore: money(basicBefore),
          basicAfter: money(after.lines.find((l) => l.code === 'BASIC')?.amount ?? 0),
          grossBefore: money(before.gross),
          grossAfter: money(after.gross),
        });
      }
      inserts.push({
        employeeId: e.id,
        structureId: latest.structureId,
        payGroupId: latest.payGroupId,
        amountsEnc: seal(CIPHER_FIELDS.payAmounts, {
          amount: money(amount),
          fixed: amounts.fixed,
        } satisfies Amounts),
        wageGrade: latest.wageGrade,
      });
    }
    return {
      preview: {
        lines,
        skipped,
        grossBefore: money(grossBefore),
        grossAfter: money(grossAfter),
      } satisfies PayBatchPreview,
      records: inserts,
    };
  }

  /** A saved batch's people before and after, for the approver. */
  private async previewOf(
    tx: Tx,
    batchId: string,
    effectiveFrom: string,
  ): Promise<PayBatchPreview> {
    const { open } = sealed(this.cipher);
    const components = await componentsOf(tx);
    const structures = new Map(
      (await tx.select().from(salaryStructures)).map((s) => [s.id, s] as const),
    );
    const changes = await tx
      .select({ pay: employeePay, employee: employees })
      .from(employeePay)
      .innerJoin(employees, eq(employees.id, employeePay.employeeId))
      .where(eq(employeePay.batchId, batchId))
      .orderBy(employees.employeeCode);
    const ids = changes.map((c) => c.employee.id);
    const previous = new Map<string, typeof employeePay.$inferSelect>();
    if (ids.length) {
      const rows = await tx
        .select()
        .from(employeePay)
        .where(
          and(
            inArray(employeePay.employeeId, ids),
            eq(employeePay.status, 'approved'),
            ne(employeePay.effectiveFrom, effectiveFrom),
          ),
        )
        .orderBy(desc(employeePay.effectiveFrom));
      for (const r of rows) if (!previous.has(r.employeeId)) previous.set(r.employeeId, r);
    }
    const lines: PayBatchLine[] = [];
    let grossBefore = new Decimal(0);
    let grossAfter = new Decimal(0);
    for (const { pay, employee } of changes) {
      const structure = structures.get(pay.structureId)!;
      const prev = previous.get(employee.id);
      const was = prev ? open<Amounts>(CIPHER_FIELDS.payAmounts, prev.amountsEnc) : null;
      const now = open<Amounts>(CIPHER_FIELDS.payAmounts, pay.amountsEnc);
      const before = was
        ? workOutPay(structures.get(prev!.structureId)!, components, was.amount, was.fixed)
        : null;
      const after = workOutPay(structure, components, now.amount, now.fixed);
      grossBefore = grossBefore.plus(before?.gross ?? 0);
      grossAfter = grossAfter.plus(after.gross);
      if (lines.length < SHOWN) {
        const basic = (r: typeof after | null) =>
          money(r?.lines.find((l) => l.code === 'BASIC')?.amount ?? 0);
        lines.push({
          employee: employeeRef(employee),
          structure: structure.name,
          wageGrade: pay.wageGrade,
          basicBefore: basic(before),
          basicAfter: basic(after),
          grossBefore: money(before?.gross ?? 0),
          grossAfter: money(after.gross),
        });
      }
    }
    return { lines, skipped: [], grossBefore: money(grossBefore), grossAfter: money(grossAfter) };
  }

  private async views(tx: Tx, where: SQL | undefined): Promise<PayBatchView[]> {
    const rows = await tx
      .select({ batch: payBatches, requestedBy: requester.name, decidedBy: decider.name })
      .from(payBatches)
      .leftJoin(requester, eq(requester.id, payBatches.requestedBy))
      .leftJoin(decider, eq(decider.id, payBatches.decidedBy))
      .where(where)
      .orderBy(desc(payBatches.createdAt));
    const steps = await loadSteps(
      tx,
      'pay_batch',
      rows.map((r) => r.batch.id),
    );
    return rows.map(({ batch, requestedBy, decidedBy }) => ({
      id: batch.id,
      effectiveFrom: batch.effectiveFrom,
      basis: batch.basis,
      percent: batch.percent,
      status: batch.status,
      people: batch.people,
      reason: batch.reason,
      requestedBy,
      decidedBy,
      createdAt: batch.createdAt.toISOString(),
      decidedAt: batch.decidedAt?.toISOString() ?? null,
      steps: steps.get(batch.id) ?? [],
    }));
  }
}
