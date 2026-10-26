import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { donors, employeeAllocations, legalEntities, projects, type Tx } from '@gp/db';
import {
  projectProblem,
  todayIn,
  type ApiError,
  type DonorInput,
  type DonorUpdateInput,
  type DonorView,
  type ProjectInput,
  type ProjectListItem,
  type ProjectUpdateInput,
  type ProjectView,
} from '@gp/shared';
import { and, asc, countDistinct, eq, gt, gte, isNull, lt, lte, ne, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { ProjectCostsService } from './project-costs.service.js';
import { projectOf, selectProjects, toDonorView } from './projects.queries.js';

/** Donors, and the projects they fund with their FD-6 approval, period and budgets. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly costs: ProjectCostsService,
  ) {}

  // ── Donors ─────────────────────────────────────────────────────────────────

  listDonors(): Promise<DonorView[]> {
    return this.tenantDb.run(async (tx) =>
      (await tx.select().from(donors).orderBy(asc(donors.code))).map(toDonorView),
    );
  }

  createDonor(actor: AuthUser, input: DonorInput): Promise<DonorView> {
    return this.tenantDb.run(async (tx) => {
      await this.donorCodeIsFree(tx, input.code);
      const [row] = await tx
        .insert(donors)
        .values({
          tenantId: currentTenantId(),
          code: input.code,
          name: input.name,
          country: input.country ?? null,
          isActive: input.isActive ?? true,
        })
        .returning();
      const view = toDonorView(row!);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.donor.create',
        entityType: 'donor',
        entityId: row!.id,
        after: view,
      });
      return view;
    });
  }

  updateDonor(actor: AuthUser, id: string, input: DonorUpdateInput): Promise<DonorView> {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select().from(donors).where(eq(donors.id, id));
      if (!before) throw new NotFoundException('Donor not found');
      if (input.code !== undefined && input.code !== before.code) {
        await this.donorCodeIsFree(tx, input.code, id);
      }
      const [row] = await tx
        .update(donors)
        .set({
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.country !== undefined ? { country: input.country || null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        })
        .where(eq(donors.id, id))
        .returning();
      const view = toDonorView(row!);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.donor.update',
        entityType: 'donor',
        entityId: id,
        before: toDonorView(before),
        after: view,
      });
      return view;
    });
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  /** Every project, with the people on it today and what it was charged this month. */
  list(): Promise<ProjectListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const all = await selectProjects(tx);
      const people = await tx
        .select({
          projectId: employeeAllocations.projectId,
          n: countDistinct(employeeAllocations.employeeId),
        })
        .from(employeeAllocations)
        .where(
          and(
            lte(employeeAllocations.fromOn, today),
            or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, today)),
          ),
        )
        .groupBy(employeeAllocations.projectId);
      const count = new Map(people.map((p) => [p.projectId, p.n]));
      const cost = await this.costs.monthTotals(tx, today.slice(0, 7));
      return all.map((p) => ({
        ...p,
        people: count.get(p.id) ?? 0,
        monthCost: cost.get(p.id) ?? '0.00',
      }));
    });
  }

  get(id: string): Promise<ProjectView> {
    return this.tenantDb.run((tx) => projectOf(tx, id));
  }

  create(actor: AuthUser, input: ProjectInput): Promise<ProjectView> {
    return this.tenantDb.run(async (tx) => {
      await this.projectCodeIsFree(tx, input.code);
      await this.references(tx, input);
      const [row] = await tx
        .insert(projects)
        .values({
          tenantId: currentTenantId(),
          legalEntityId: input.legalEntityId,
          code: input.code,
          name: input.name,
          startsOn: input.startsOn,
          ...this.fields(input),
        })
        .returning();
      const view = await projectOf(tx, row!.id);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.project.create',
        entityType: 'project',
        entityId: row!.id,
        after: view,
      });
      return view;
    });
  }

  update(actor: AuthUser, id: string, input: ProjectUpdateInput): Promise<ProjectView> {
    return this.tenantDb.run(async (tx) => {
      const before = await projectOf(tx, id);
      if (input.code !== undefined && input.code !== before.code) {
        await this.projectCodeIsFree(tx, input.code, id);
      }
      await this.references(tx, input);
      const merged = {
        startsOn: input.startsOn ?? before.startsOn,
        endsOn: input.endsOn !== undefined ? input.endsOn : before.endsOn,
        approvedBudget:
          input.approvedBudget !== undefined ? input.approvedBudget : before.approvedBudget,
        staffBudget: input.staffBudget !== undefined ? input.staffBudget : before.staffBudget,
      };
      const problem = projectProblem(merged);
      if (problem) {
        const body: ApiError = {
          statusCode: 400,
          error: 'Bad Request',
          message: problem.message,
          code: 'validation_failed',
          issues: [problem],
        };
        throw new BadRequestException(body);
      }
      if (merged.startsOn !== before.startsOn || merged.endsOn !== before.endsOn) {
        await this.allocationsWithin(tx, id, merged.startsOn, merged.endsOn ?? null);
      }
      await tx
        .update(projects)
        .set({
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.legalEntityId !== undefined ? { legalEntityId: input.legalEntityId } : {}),
          ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
          ...this.fields(input),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
      const view = await projectOf(tx, id);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.project.update',
        entityType: 'project',
        entityId: id,
        before,
        after: view,
      });
      return view;
    });
  }

  /**
   * Closes a project: it takes no new shares of salary, and its period ends (today, unless it
   * ended earlier). Shares running past the end are ended on it, and shares not started by
   * then are removed, so nothing more is charged to it.
   */
  close(actor: AuthUser, id: string): Promise<ProjectView> {
    return this.tenantDb.run(async (tx) => {
      const before = await projectOf(tx, id);
      if (before.status === 'closed') return before;
      const today = todayIn();
      const endsOn =
        before.endsOn && before.endsOn < today
          ? before.endsOn
          : today < before.startsOn
            ? before.startsOn
            : today;
      const removed = await tx
        .delete(employeeAllocations)
        .where(and(eq(employeeAllocations.projectId, id), gt(employeeAllocations.fromOn, endsOn)))
        .returning({ id: employeeAllocations.id });
      const ended = await tx
        .update(employeeAllocations)
        .set({ toOn: endsOn })
        .where(
          and(
            eq(employeeAllocations.projectId, id),
            or(isNull(employeeAllocations.toOn), gt(employeeAllocations.toOn, endsOn)),
          ),
        )
        .returning({ id: employeeAllocations.id });
      await tx
        .update(projects)
        .set({ status: 'closed', endsOn, updatedAt: new Date() })
        .where(eq(projects.id, id));
      const view = await projectOf(tx, id);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'projects.project.close',
        entityType: 'project',
        entityId: id,
        before: { status: before.status, endsOn: before.endsOn },
        after: {
          status: view.status,
          endsOn: view.endsOn,
          allocationsEnded: ended.length,
          allocationsRemoved: removed.length,
        },
      });
      return view;
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private fields(input: ProjectUpdateInput) {
    const out: Partial<Omit<typeof projects.$inferInsert, 'tenantId'>> = {};
    if (input.nameBn !== undefined) out.nameBn = input.nameBn || null;
    if (input.donorId !== undefined) out.donorId = input.donorId;
    if (input.grantReference !== undefined) out.grantReference = input.grantReference || null;
    if (input.fd6ApprovalNo !== undefined) out.fd6ApprovalNo = input.fd6ApprovalNo || null;
    if (input.fd6ApprovedOn !== undefined) out.fd6ApprovedOn = input.fd6ApprovedOn;
    if (input.endsOn !== undefined) out.endsOn = input.endsOn;
    if (input.approvedBudget !== undefined) out.approvedBudget = input.approvedBudget;
    if (input.staffBudget !== undefined) out.staffBudget = input.staffBudget;
    if (input.note !== undefined) out.note = input.note || null;
    return out;
  }

  /** The company is one of the workspace's, and the donor one of its donors. */
  private async references(tx: Tx, input: ProjectUpdateInput) {
    if (input.legalEntityId) {
      const [entity] = await tx
        .select({ id: legalEntities.id })
        .from(legalEntities)
        .where(eq(legalEntities.id, input.legalEntityId));
      if (!entity) throw badRequest('legal_entity_unknown', 'Choose one of your companies');
    }
    if (input.donorId) {
      const [donor] = await tx
        .select({ id: donors.id })
        .from(donors)
        .where(eq(donors.id, input.donorId));
      if (!donor) throw badRequest('donor_unknown', 'Choose one of your donors');
    }
  }

  /** A new period must still hold every share of salary already given to the project. */
  private async allocationsWithin(tx: Tx, id: string, startsOn: string, endsOn: string | null) {
    const [outside] = await tx
      .select({ id: employeeAllocations.id })
      .from(employeeAllocations)
      .where(
        and(
          eq(employeeAllocations.projectId, id),
          or(
            lt(employeeAllocations.fromOn, startsOn),
            endsOn
              ? or(isNull(employeeAllocations.toOn), gt(employeeAllocations.toOn, endsOn))
              : undefined,
          ),
        ),
      )
      .limit(1);
    if (outside) {
      throw conflict(
        'allocation_outside_project',
        'Some shares of salary fall outside this period; end or remove them first',
      );
    }
  }

  private async donorCodeIsFree(tx: Tx, code: string, exceptId?: string) {
    const [taken] = await tx
      .select({ id: donors.id })
      .from(donors)
      .where(and(eq(donors.code, code), exceptId ? ne(donors.id, exceptId) : undefined));
    if (taken) throw conflict('donor_code_taken', `Another donor has the code ${code}`);
  }

  private async projectCodeIsFree(tx: Tx, code: string, exceptId?: string) {
    const [taken] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.code, code), exceptId ? ne(projects.id, exceptId) : undefined));
    if (taken) throw conflict('project_code_taken', `Another project has the code ${code}`);
  }
}
