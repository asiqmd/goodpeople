import { Injectable, NotFoundException } from '@nestjs/common';
import { employeeAllocations, employees, projects, type Tx } from '@gp/db';
import {
  addDays,
  todayIn,
  type AllocationEndInput,
  type AllocationInput,
  type AllocationView,
} from '@gp/shared';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { lockedPeriods } from '../production/production.queries.js';
import { selectAllocations, type ProjectRow } from './projects.queries.js';
import { overAllocatedOn } from './shares.js';

type AllocationRow = typeof employeeAllocations.$inferSelect;

/**
 * The planned split of each person's salary across projects, from a date: the basis of the
 * charge until an approved timesheet shows the work actually done. A person's shares on any
 * day add up to at most 100%; the rest stays with their own unit.
 */
@Injectable()
export class AllocationsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  forProject(projectId: string): Promise<AllocationView[]> {
    return this.tenantDb.run(async (tx) => {
      await this.projectRow(tx, projectId);
      return selectAllocations(tx, eq(employeeAllocations.projectId, projectId));
    });
  }

  forEmployee(employeeId: string): Promise<AllocationView[]> {
    return this.tenantDb.run((tx) =>
      selectAllocations(tx, eq(employeeAllocations.employeeId, employeeId)),
    );
  }

  add(actor: AuthUser, projectId: string, input: AllocationInput): Promise<AllocationView> {
    return this.tenantDb.run(async (tx) => {
      const project = await this.projectRow(tx, projectId);
      if (project.status === 'closed') {
        throw conflict('project_closed', 'This project is closed');
      }
      // Without an end, the share runs to the end of the project.
      const range = { fromOn: input.fromOn, toOn: input.toOn ?? project.endsOn };
      this.withinProject(project, range);
      await this.lockEmployee(tx, input.employeeId);
      await this.notInLockedPay(tx, input.employeeId, range.fromOn, range.toOn);
      await this.notOver100(tx, input.employeeId, { percent: input.percent, ...range });
      const [row] = await tx
        .insert(employeeAllocations)
        .values({
          tenantId: currentTenantId(),
          employeeId: input.employeeId,
          projectId,
          percent: input.percent,
          costKind: input.costKind,
          fromOn: range.fromOn,
          toOn: range.toOn,
          createdBy: actor.id,
        })
        .returning();
      const view = await this.viewOf(tx, row!.id);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.allocation.create',
        entityType: 'employee_allocation',
        entityId: row!.id,
        after: view,
      });
      return view;
    });
  }

  /** Ends a share on a day; it can be ended earlier, never stretched. */
  end(actor: AuthUser, id: string, input: AllocationEndInput): Promise<AllocationView> {
    return this.tenantDb.run(async (tx) => {
      const before = await this.rowOf(tx, id);
      if (input.toOn < before.fromOn) {
        throw badRequest('allocation_end_before_start', 'A share cannot end before it starts');
      }
      if (before.toOn && input.toOn > before.toOn) {
        throw badRequest('allocation_end_later', `This share already ends on ${before.toOn}`);
      }
      await this.notInLockedPay(tx, before.employeeId, addDays(input.toOn, 1), before.toOn);
      await tx
        .update(employeeAllocations)
        .set({ toOn: input.toOn })
        .where(eq(employeeAllocations.id, id));
      const view = await this.viewOf(tx, id);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.allocation.end',
        entityType: 'employee_allocation',
        entityId: id,
        before: { toOn: before.toOn },
        after: { toOn: input.toOn },
      });
      return view;
    });
  }

  /** Only a share that has not started yet can be removed; one in force is ended instead. */
  remove(actor: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const before = await this.viewOf(tx, id);
      if (before.fromOn <= todayIn()) {
        throw conflict('allocation_started', 'This share has started; end it instead');
      }
      await tx.delete(employeeAllocations).where(eq(employeeAllocations.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.allocation.delete',
        entityType: 'employee_allocation',
        entityId: id,
        before,
      });
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** A share is charged only within the project's period (FD-6 approved; FDVA 2016 s.6). */
  private withinProject(project: ProjectRow, range: { fromOn: string; toOn: string | null }) {
    const outside =
      range.fromOn < project.startsOn ||
      (project.endsOn !== null && (range.toOn === null || range.toOn > project.endsOn));
    if (outside) {
      throw badRequest(
        'allocation_outside_project',
        `The project runs from ${project.startsOn}${project.endsOn ? ` to ${project.endsOn}` : ''}`,
      );
    }
  }

  /**
   * Pay locked in payroll has been posted to the journal by these shares, so the days it
   * covers keep them.
   */
  private async notInLockedPay(tx: Tx, employeeId: string, from: string, to: string | null) {
    const locked = await lockedPeriods(tx, [employeeId], from, to ?? '9999-12-31');
    const first = locked.get(employeeId)?.[0];
    if (first) {
      throw conflict(
        'allocation_pay_locked',
        `Pay from ${first.start} to ${first.end} is locked in payroll, so its shares cannot change`,
      );
    }
  }

  private async notOver100(
    tx: Tx,
    employeeId: string,
    added: { percent: string; fromOn: string; toOn: string | null },
  ) {
    const existing = await tx
      .select({
        percent: employeeAllocations.percent,
        fromOn: employeeAllocations.fromOn,
        toOn: employeeAllocations.toOn,
      })
      .from(employeeAllocations)
      .where(
        and(
          eq(employeeAllocations.employeeId, employeeId),
          added.toOn ? lte(employeeAllocations.fromOn, added.toOn) : undefined,
          or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, added.fromOn)),
        ),
      );
    const day = overAllocatedOn(existing, added);
    if (day) {
      throw conflict(
        'allocation_over_100',
        `On ${day} this person's shares would add up to more than 100%`,
      );
    }
  }

  /** One writer at a time per person, so two shares added together cannot pass 100%. */
  private async lockEmployee(tx: Tx, employeeId: string) {
    const [found] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .for('update');
    if (!found) throw badRequest('employee_unknown', 'Choose one of your employees');
  }

  private async projectRow(tx: Tx, id: string): Promise<ProjectRow> {
    const [row] = await tx.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new NotFoundException('Project not found');
    return row;
  }

  private async rowOf(tx: Tx, id: string): Promise<AllocationRow> {
    const [row] = await tx.select().from(employeeAllocations).where(eq(employeeAllocations.id, id));
    if (!row) throw new NotFoundException('Allocation not found');
    return row;
  }

  private async viewOf(tx: Tx, id: string): Promise<AllocationView> {
    const [view] = await selectAllocations(tx, eq(employeeAllocations.id, id));
    if (!view) throw new NotFoundException('Allocation not found');
    return view;
  }
}
