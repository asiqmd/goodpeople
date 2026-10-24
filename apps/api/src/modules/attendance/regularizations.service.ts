import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalSteps,
  attendancePunches,
  employees,
  regularizationRequests,
  type Tx,
} from '@gp/db';
import {
  addDays,
  todayIn,
  zonedInstant,
  type ApprovalItem,
  type RegularizationInput,
  type RegularizationStatus,
  type RegularizationView,
} from '@gp/shared';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import {
  cancelOpenSteps,
  createApprovalSteps,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
} from '../approvals/approval-steps.js';
import {
  correctionSummary,
  noticeRequested,
  type ApprovalSummary,
} from '../approvals/approval-notices.js';
import { loadSteps } from '../approvals/approval-views.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { userCan } from '../../common/roles.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { timeZoneOf } from './attendance.service.js';
import { employeeRef, toDayView } from './attendance-views.js';
import { AttendanceProcessor, settingsOf, type ComputedDay } from './processor.service.js';

type RegularizationRow = typeof regularizationRequests.$inferSelect;

/**
 * Asking to correct a day: a punch the device missed, or a day on official duty elsewhere.
 * Decided through the approvals inbox; approving a missed punch adds it as a punch marked
 * as a regularization, so the day's history stays visible.
 */
@Injectable()
export class RegularizationsService implements ApprovalSubjectHandler<RegularizationView> {
  readonly auditPrefix = 'attendance.regularization';
  readonly entityType = 'regularization' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly processor: AttendanceProcessor,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(user: AuthUser, input: RegularizationInput): Promise<RegularizationView> {
    const id = await this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      const settings = await settingsOf(tx);
      const timeZone = await timeZoneOf(tx, me.id);
      const today = todayIn(timeZone);
      if (input.date > today) {
        throw badRequest('future_day', 'Only days that have started can be corrected');
      }
      if (input.date < addDays(today, -settings.regularizationWindowDays)) {
        throw badRequest(
          'outside_window',
          `Corrections can go back ${settings.regularizationWindowDays} days`,
        );
      }
      const [day] = await this.processor.compute(tx, {
        employeeIds: [me.id],
        from: input.date,
        to: input.date,
      });
      if (!day) throw badRequest('not_tracked', 'Attendance was not tracked on that day');
      if (input.kind === 'missed_punch') this.requestedPunches(day, input);
      const [pending] = await tx
        .select({ id: regularizationRequests.id })
        .from(regularizationRequests)
        .where(
          and(
            eq(regularizationRequests.employeeId, me.id),
            eq(regularizationRequests.date, input.date),
            eq(regularizationRequests.status, 'pending'),
          ),
        );
      if (pending) {
        throw conflict('already_pending', 'A correction for this day is already waiting');
      }

      const [row] = await tx
        .insert(regularizationRequests)
        .values({
          tenantId: currentTenantId(),
          employeeId: me.id,
          date: input.date,
          kind: input.kind,
          inTime: input.inTime ?? null,
          outTime: input.outTime ?? null,
          reason: input.reason,
          appliedBy: user.id,
        })
        .returning();
      const someoneDecides = await createApprovalSteps(tx, {
        tenantId: row!.tenantId,
        type: 'regularization',
        id: row!.id,
        employeeId: me.id,
        onDate: input.date,
        chain: settings.regularizationChain,
      });
      if (!someoneDecides) await this.finalize(tx, row!.id, 'approved', user.id);
      else {
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'regularization', id: row!.id },
          await this.summarize(tx, row!.id),
        );
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'attendance.regularization.apply',
        entityType: 'regularization',
        entityId: row!.id,
        after: input,
      });
      return row!.id;
    });
    return this.view(id);
  }

  /**
   * The punches a missed-punch correction asks for. Times are local; an out time earlier
   * than the shift start (or the in time) is the next morning, as on a night shift. Each must
   * fall within the day, and not in the future.
   */
  private requestedPunches(
    day: ComputedDay,
    input: Pick<RegularizationRow, 'date' | 'inTime' | 'outTime'> | RegularizationInput,
  ): Date[] {
    const { timeZone, window } = day.plan;
    const inAt = input.inTime ? zonedInstant(input.date, input.inTime, timeZone) : null;
    let outAt = input.outTime ? zonedInstant(input.date, input.outTime, timeZone) : null;
    if (outAt && outAt <= (inAt ?? window.start)) {
      outAt = zonedInstant(addDays(input.date, 1), input.outTime!, timeZone);
    }
    const punches = [inAt, outAt].filter((p): p is Date => p !== null);
    for (const p of punches) {
      if (p < day.opensAt || p >= day.closesAt) {
        throw badRequest('wrong_day', 'That time belongs to another day’s shift');
      }
      if (p > new Date()) throw badRequest('future_punch', 'A punch cannot be in the future');
    }
    return punches;
  }

  async cancel(user: AuthUser, id: string): Promise<RegularizationView> {
    await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(regularizationRequests)
        .where(eq(regularizationRequests.id, id))
        .for('update');
      if (!row) throw new NotFoundException('Correction not found');
      const me = await employeeOfUser(tx, user.id);
      if (me?.id !== row.employeeId && !userCan(user, 'attendance.manage')) {
        throw new ForbiddenException('You can only cancel your own corrections');
      }
      if (row.status !== 'pending')
        throw conflict('not_pending', `This correction is ${row.status}`);
      await tx
        .update(regularizationRequests)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(regularizationRequests.id, id));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'attendance.regularization.cancel',
        entityType: 'regularization',
        entityId: id,
      });
    });
    return this.view(id);
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  private async load(tx: Tx, where: SQL | undefined): Promise<RegularizationView[]> {
    const rows = await tx
      .select({ r: regularizationRequests, employee: employees })
      .from(regularizationRequests)
      .innerJoin(employees, eq(employees.id, regularizationRequests.employeeId))
      .where(where)
      .orderBy(desc(regularizationRequests.date), desc(regularizationRequests.createdAt));
    const steps = await loadSteps(
      tx,
      'regularization',
      rows.map((r) => r.r.id),
    );
    return rows.map(({ r, employee }) => ({
      id: r.id,
      employee: employeeRef(employee),
      date: r.date,
      kind: r.kind,
      inTime: r.inTime?.slice(0, 5) ?? null,
      outTime: r.outTime?.slice(0, 5) ?? null,
      reason: r.reason,
      status: r.status,
      steps: steps.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
    }));
  }

  async view(id: string): Promise<RegularizationView> {
    const [view] = await this.tenantDb.run((tx) =>
      this.load(tx, eq(regularizationRequests.id, id)),
    );
    if (!view) throw new NotFoundException('Correction not found');
    return view;
  }

  listMine(user: AuthUser): Promise<RegularizationView[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return this.load(tx, eq(regularizationRequests.employeeId, me.id));
    });
  }

  listAll(query: { status?: RegularizationStatus }): Promise<RegularizationView[]> {
    return this.tenantDb.run((tx) =>
      this.load(tx, query.status ? eq(regularizationRequests.status, query.status) : undefined),
    );
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ r: regularizationRequests, name: employees.fullName })
      .from(regularizationRequests)
      .innerJoin(employees, eq(employees.id, regularizationRequests.employeeId))
      .where(eq(regularizationRequests.id, subjectId));
    return {
      employeeId: row!.r.employeeId,
      personName: row!.name,
      summary: correctionSummary(row!.r.kind, row!.r.date),
      link: '/workspace/attendance',
    };
  }

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ employeeId: regularizationRequests.employeeId })
      .from(regularizationRequests)
      .where(eq(regularizationRequests.id, subjectId))
      .for('update');
    return row ?? null;
  }

  ownedBy(tx: Tx, employeeId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: regularizationRequests.id })
        .from(regularizationRequests)
        .where(eq(regularizationRequests.employeeId, employeeId)),
    );
  }

  async finalize(
    tx: Tx,
    subjectId: string,
    outcome: 'approved' | 'rejected',
    actorUserId: string,
  ): Promise<void> {
    const [row] = await tx
      .update(regularizationRequests)
      .set({ status: outcome, decidedAt: new Date() })
      .where(eq(regularizationRequests.id, subjectId))
      .returning();
    if (outcome !== 'approved') return;
    if (row!.kind === 'missed_punch') {
      const [day] = await this.processor.compute(tx, {
        employeeIds: [row!.employeeId],
        from: row!.date,
        to: row!.date,
      });
      if (day) {
        await tx.insert(attendancePunches).values(
          this.requestedPunches(day, row!).map((punchedAt) => ({
            tenantId: row!.tenantId,
            employeeId: row!.employeeId,
            punchedAt,
            source: 'regularization' as const,
            regularizationId: row!.id,
            note: row!.reason,
            createdBy: actorUserId,
          })),
        );
      }
    }
    await this.processor.processSince(tx, [row!.employeeId], addDays(row!.date, -1), row!.date);
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const views = await this.load(
      tx,
      inArray(
        regularizationRequests.id,
        steps.map((s) => s.subjectId),
      ),
    );
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const regularization = views.find((v) => v.id === step.subjectId);
      if (!regularization) continue;
      const [day] = await this.processor.compute(tx, {
        employeeIds: [regularization.employee.id],
        from: regularization.date,
        to: regularization.date,
      });
      items.push({
        sortKey: regularization.date,
        item: {
          subjectType: 'regularization',
          stepId: step.id,
          kind: step.kind,
          regularization,
          day: day ? toDayView(day) : null,
        },
      });
    }
    return items;
  }
}
