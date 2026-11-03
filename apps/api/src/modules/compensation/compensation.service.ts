import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { bdRmgIncrement } from '@gp/country-packs';
import {
  CIPHER_FIELDS,
  compensationLines,
  compensationRounds,
  employeePay,
  employees,
  grades,
  jobAssignments,
  legalEntities,
  orgUnits,
  payGroups,
  reviewCycles,
  reviews,
  salaryStructures,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  money,
  positionInRange,
  todayIn,
  type CompensationAmounts,
  type CompensationCreateInput,
  type CompensationLineView,
  type CompensationProposalInput,
  type CompensationRoundListItem,
  type CompensationRoundView,
} from '@gp/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { userCan } from '../../common/roles.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { employeeOfUser, inForceOn } from '../employees/employee.queries.js';
import { NotificationsService, localDate } from '../notifications/notifications.service.js';
import { EmployeePayService } from '../payroll/employee-pay.service.js';
import { workOutPay } from '../payroll/pay-calc.js';
import { componentsOf } from '../payroll/payroll-setup.service.js';
import { completedMonths } from '../payroll/run-engine.js';
import { sealed } from '../payroll/run-context.js';
import { budgetUse, compensationPay } from './calculation.js';

type Round = typeof compensationRounds.$inferSelect;
const notFound = () => new NotFoundException('Compensation round not found');

@Injectable()
export class CompensationService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    private readonly pay: EmployeePayService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  private async access(tx: Tx, user: AuthUser, companyId: string) {
    const scope = await entityScopeOf(tx, user.id);
    if (scope && !scope.includes(companyId)) throw notFound();
    const me = await employeeOfUser(tx, user.id);
    return { manage: userCan(user, 'compensation.manage'), employeeId: me?.id ?? null };
  }

  private async round(tx: Tx, id: string, lock = false) {
    const q = tx.select().from(compensationRounds).where(eq(compensationRounds.id, id));
    const [round] = lock ? await q.for('update') : await q;
    if (!round) throw notFound();
    return round;
  }

  private async requireManage(tx: Tx, user: AuthUser, round: Pick<Round, 'legalEntityId'>) {
    const access = await this.access(tx, user, round.legalEntityId);
    if (!access.manage) throw new ForbiddenException('Compensation management is required');
  }

  async list(user: AuthUser): Promise<CompensationRoundListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const rounds = await tx
        .select()
        .from(compensationRounds)
        .orderBy(desc(compensationRounds.createdAt));
      const result: CompensationRoundListItem[] = [];
      const scope = await entityScopeOf(tx, user.id);
      for (const round of rounds) {
        if (scope && !scope.includes(round.legalEntityId)) continue;
        const view = await this.view(tx, user, round);
        if (view.manage || view.people) {
          const { id, name, company, effectiveFrom, status, people, submitted } = view;
          result.push({ id, name, company, effectiveFrom, status, people, submitted });
        }
      }
      return result;
    });
  }

  get(user: AuthUser, id: string): Promise<CompensationRoundView> {
    return this.tenantDb.run(async (tx) => {
      const view = await this.view(tx, user, await this.round(tx, id));
      if (!view.manage && !view.people) throw notFound();
      return view;
    });
  }

  async create(user: AuthUser, input: CompensationCreateInput) {
    const id = await this.tenantDb.run(async (tx) => {
      await this.requireManage(tx, user, input);
      const [company] = await tx
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.id, input.legalEntityId));
      if (!company?.isActive) throw notFound();
      await this.validateBudgets(tx, input.legalEntityId, input.budgets);
      const gradeRows = await tx.select().from(grades);
      if (input.ranges.some((r) => !gradeRows.some((g) => g.id === r.gradeId && g.isActive)))
        throw badRequest('compensation_range', 'Choose active grades in this workspace');
      if (input.cycleId) {
        const [cycle] = await tx
          .select()
          .from(reviewCycles)
          .where(eq(reviewCycles.id, input.cycleId));
        if (!cycle || !['released', 'closed'].includes(cycle.status))
          throw badRequest('compensation_cycle', 'Choose a released review cycle');
      }
      const rule = input.rmgAnnual ? bdRmgIncrement(input.effectiveFrom) : null;
      if (input.rmgAnnual && !rule)
        throw badRequest('compensation_rule', 'No RMG increment rule applies on this date');
      const jobs = await tx
        .select({ job: jobAssignments, employee: employees })
        .from(jobAssignments)
        .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
        .where(
          and(
            eq(jobAssignments.legalEntityId, input.legalEntityId),
            inForceOn(input.effectiveFrom),
            eq(employees.status, 'active'),
          ),
        )
        .orderBy(employees.employeeCode);
      const payRows = await tx
        .select()
        .from(employeePay)
        .where(inArray(employeePay.status, ['approved', 'pending']))
        .orderBy(desc(employeePay.effectiveFrom), desc(employeePay.createdAt));
      const structures = new Map((await tx.select().from(salaryStructures)).map((s) => [s.id, s]));
      const groups = new Map((await tx.select().from(payGroups)).map((g) => [g.id, g]));
      const ratings = input.cycleId
        ? await tx
            .select()
            .from(reviews)
            .where(
              and(
                eq(reviews.cycleId, input.cycleId),
                inArray(reviews.status, ['released', 'acknowledged']),
              ),
            )
        : [];
      const previousAnnual = input.rmgAnnual
        ? await tx
            .select({
              employeeId: compensationLines.employeeId,
              on: compensationRounds.effectiveFrom,
              status: employeePay.status,
            })
            .from(compensationLines)
            .innerJoin(compensationRounds, eq(compensationRounds.id, compensationLines.roundId))
            .innerJoin(employeePay, eq(employeePay.id, compensationLines.payChangeId))
            .where(
              and(
                eq(compensationRounds.rmgAnnual, true),
                eq(compensationRounds.status, 'payroll'),
                inArray(employeePay.status, ['pending', 'approved']),
              ),
            )
        : [];
      const { open, seal } = sealed(this.cipher);
      const components = await componentsOf(tx);
      const records: Omit<typeof compensationLines.$inferInsert, 'roundId' | 'tenantId'>[] = [];
      const skipped: CompensationRoundView['skipped'] = [];
      for (const { job, employee } of jobs) {
        const skip = (reason: string) => skipped.push({ employee: employeeRef(employee), reason });
        const review = ratings.find((r) => r.employeeId === employee.id);
        if (input.cycleId && (!review || review.finalRating === null)) {
          skip('no_released_review');
          continue;
        }
        const own = payRows.filter((p) => p.employeeId === employee.id);
        const source = own.find((p) => p.status === 'approved');
        if (!source) {
          skip('no_pay');
          continue;
        }
        if (own.some((p) => p.status === 'pending')) {
          skip('pending_change');
          continue;
        }
        if (source.effectiveFrom > input.effectiveFrom) {
          skip('later_pay');
          continue;
        }
        const structure = structures.get(source.structureId)!;
        if (!structure.isActive || !groups.get(source.payGroupId)?.isActive) {
          skip('inactive_pay_setup');
          continue;
        }
        if (input.rmgAnnual) {
          if (structure.wageBoard !== 'BD_RMG_2023' || job.workerCategory !== 'worker') {
            skip('not_rmg');
            continue;
          }
          if (completedMonths(employee.joinedOn, input.effectiveFrom) < rule!.minServiceMonths) {
            skip('not_eligible');
            continue;
          }
          if (
            previousAnnual.some(
              (p) =>
                p.employeeId === employee.id &&
                p.on <= input.effectiveFrom &&
                completedMonths(p.on, input.effectiveFrom) < 12,
            )
          ) {
            skip('annual_already_planned');
            continue;
          }
        }
        const amounts = open<{ amount: string; fixed: Record<string, string> }>(
          CIPHER_FIELDS.payAmounts,
          source.amountsEnc,
        );
        const before = workOutPay(structure, components, amounts.amount, amounts.fixed);
        const basic = before.lines.find((l) => l.code === 'BASIC')?.amount ?? '0';
        if (before.problems.length || new Decimal(basic).lessThanOrEqualTo(0)) {
          skip('invalid_pay');
          continue;
        }
        const range = input.ranges.find((r) => r.gradeId === job.gradeId);
        if (input.cycleId && !range) {
          skip('no_range');
          continue;
        }
        const band = range ? positionInRange(before.gross, range.minimum, range.maximum) : null;
        const percent =
          review && band
            ? input.matrix[String(review.finalRating) as keyof typeof input.matrix][band]
            : '0';
        const snapshot: CompensationAmounts = {
          ...amounts,
          grossBefore: before.gross,
          basicBefore: basic,
          suggestedPercent: percent,
          percent,
          amountAfter: amounts.amount,
          grossAfter: before.gross,
          basicAfter: basic,
          band,
          minimumBasic: input.rmgAnnual
            ? money(
                new Decimal(basic)
                  .times(new Decimal(rule!.percentOfBasic).dividedBy(100).plus(1))
                  .ceil(),
              )
            : basic,
        };
        records.push({
          employeeId: employee.id,
          orgUnitId: job.orgUnitId,
          jobId: job.id,
          sourcePayId: source.id,
          reviewId: review?.id ?? null,
          rating: review?.finalRating ?? null,
          incrementRecommended: review?.recommendations?.increment ?? false,
          amountsEnc: seal(
            CIPHER_FIELDS.compensationAmounts,
            compensationPay(snapshot, percent, structure, components),
          ),
        });
      }
      if (!records.length)
        throw badRequest(
          'compensation_empty',
          'No eligible people: check released reviews, pay, ranges and RMG service',
        );
      const [round] = await tx
        .insert(compensationRounds)
        .values({ ...input, tenantId: currentTenantId(), createdBy: user.id, skipped })
        .returning();
      for (const record of records)
        await tx
          .insert(compensationLines)
          .values({ ...record, tenantId: currentTenantId(), roundId: round!.id });
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compensation.create',
        entityType: 'compensation_round',
        entityId: round!.id,
        after: {
          people: records.length,
          skipped: skipped.length,
          effectiveFrom: input.effectiveFrom,
        },
      });
      const managers = [
        ...new Set(
          jobs
            .filter(({ employee }) => records.some((r) => r.employeeId === employee.id))
            .flatMap(({ job }) => job.managerId ?? []),
        ),
      ];
      await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients: managers.map((employeeId) => ({ employeeId })),
        values: {
          'task.title': {
            en: `Compensation proposals: ${input.name}`,
            bn: `বেতন বৃদ্ধির প্রস্তাব: ${input.name}`,
          },
          'task.detail': {
            en: 'Review and submit proposals for your direct reports.',
            bn: 'আপনার সরাসরি অধীনস্থদের বেতন বৃদ্ধির প্রস্তাব পর্যালোচনা করে জমা দিন।',
          },
          'task.due': localDate(input.effectiveFrom),
        },
        link: `/workspace/performance/compensation/${round!.id}`,
        dedupeKey: `compensation:${round!.id}`,
      });
      return round!.id;
    });
    return this.get(user, id);
  }

  async propose(user: AuthUser, id: string, lineId: string, input: CompensationProposalInput) {
    await this.tenantDb.run(async (tx) => {
      const round = await this.round(tx, id, true);
      this.mustOpen(round);
      const view = await this.view(tx, user, round);
      const visible = view.lines.find((l) => l.id === lineId);
      if (!visible) throw notFound();
      if (!visible.canEdit) throw new ForbiddenException('This proposal cannot be edited');
      const [line] = await tx
        .select()
        .from(compensationLines)
        .where(eq(compensationLines.id, lineId));
      if (line!.version !== input.version)
        throw conflict('compensation_changed', 'The proposal changed; reload before saving');
      const [source] = await tx
        .select()
        .from(employeePay)
        .where(eq(employeePay.id, line!.sourcePayId));
      const [structure] = await tx
        .select()
        .from(salaryStructures)
        .where(eq(salaryStructures.id, source!.structureId));
      const { open, seal } = sealed(this.cipher);
      const before = open<CompensationAmounts>(CIPHER_FIELDS.compensationAmounts, line!.amountsEnc);
      const result = compensationPay(before, input.percent, structure!, await componentsOf(tx));
      await tx
        .update(compensationLines)
        .set({
          amountsEnc: seal(CIPHER_FIELDS.compensationAmounts, result),
          reason: input.reason,
          submitted: input.submit,
          version: line!.version + 1,
          updatedBy: user.id,
        })
        .where(eq(compensationLines.id, lineId));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: input.submit ? 'compensation.proposal.submit' : 'compensation.proposal.save',
        entityType: 'compensation_line',
        entityId: lineId,
        after: { reason: input.reason, roundId: id },
      });
    });
    return this.get(user, id);
  }

  async budgets(user: AuthUser, id: string, budgets: CompensationCreateInput['budgets']) {
    await this.tenantDb.run(async (tx) => {
      const round = await this.round(tx, id, true);
      await this.requireManage(tx, user, round);
      this.mustOpen(round);
      await this.validateBudgets(tx, round.legalEntityId, budgets);
      await tx.update(compensationRounds).set({ budgets }).where(eq(compensationRounds.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compensation.budgets',
        entityType: 'compensation_round',
        entityId: id,
        after: { budgets: budgets.length },
      });
    });
    return this.get(user, id);
  }

  async export(user: AuthUser, id: string) {
    await this.tenantDb.run(async (tx) => {
      const round = await this.round(tx, id, true);
      await this.requireManage(tx, user, round);
      this.mustOpen(round);
      const view = await this.view(tx, user, round);
      if (view.lines.some((l) => !l.submitted))
        throw conflict('compensation_unsubmitted', 'Every proposal must be submitted first');
      if (view.budgets.some((b) => !b.within))
        throw conflict('compensation_budget', 'The proposals exceed a company or unit budget');
      const lines = await tx
        .select()
        .from(compensationLines)
        .where(eq(compensationLines.roundId, id))
        .orderBy(compensationLines.employeeId);
      const { open } = sealed(this.cipher);
      for (const line of lines) {
        // The same employee lock payroll uses serializes changes from another round or tab.
        await tx
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.id, line.employeeId))
          .for('update');
        const own = await tx
          .select()
          .from(employeePay)
          .where(
            and(
              eq(employeePay.employeeId, line.employeeId),
              inArray(employeePay.status, ['approved', 'pending']),
            ),
          )
          .orderBy(desc(employeePay.effectiveFrom), desc(employeePay.createdAt));
        const [job] = await tx
          .select()
          .from(jobAssignments)
          .where(
            and(eq(jobAssignments.employeeId, line.employeeId), inForceOn(round.effectiveFrom)),
          );
        if (
          own.some((p) => p.status === 'pending') ||
          own.find((p) => p.status === 'approved')?.id !== line.sourcePayId ||
          job?.id !== line.jobId
        )
          throw conflict(
            'compensation_stale',
            'Pay or job changed since planning; cancel and rebuild this round',
          );
        const amounts = open<CompensationAmounts>(
          CIPHER_FIELDS.compensationAmounts,
          line.amountsEnc,
        );
        if (new Decimal(amounts.grossAfter).equals(amounts.grossBefore)) continue;
        const source = own.find((p) => p.id === line.sourcePayId)!;
        // Recompute against today's structure/components and compare with the reviewed snapshot.
        const [structure] = await tx
          .select()
          .from(salaryStructures)
          .where(eq(salaryStructures.id, source.structureId));
        const checked = compensationPay(
          amounts,
          amounts.percent,
          structure!,
          await componentsOf(tx),
        );
        if (
          checked.amountAfter !== amounts.amountAfter ||
          checked.grossAfter !== amounts.grossAfter ||
          checked.basicAfter !== amounts.basicAfter
        )
          throw conflict(
            'compensation_stale',
            'Pay formulas changed since planning; cancel and rebuild this round',
          );
        const payChangeId = await this.pay.proposeInTransaction(
          tx,
          user,
          line.employeeId,
          {
            effectiveFrom: round.effectiveFrom,
            structureId: source.structureId,
            payGroupId: source.payGroupId,
            amount: amounts.amountAfter,
            fixed: amounts.fixed,
            wageGrade: source.wageGrade,
            reason: `${round.name}: ${line.reason}`.slice(0, 500),
          },
          true,
        );
        await tx
          .update(compensationLines)
          .set({ payChangeId })
          .where(eq(compensationLines.id, line.id));
      }
      await tx
        .update(compensationRounds)
        .set({ status: 'payroll', exportedAt: new Date() })
        .where(eq(compensationRounds.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compensation.export',
        entityType: 'compensation_round',
        entityId: id,
        after: { people: lines.length },
      });
    });
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    await this.tenantDb.run(async (tx) => {
      const round = await this.round(tx, id, true);
      await this.requireManage(tx, user, round);
      this.mustOpen(round);
      await tx
        .update(compensationRounds)
        .set({ status: 'cancelled' })
        .where(eq(compensationRounds.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compensation.cancel',
        entityType: 'compensation_round',
        entityId: id,
      });
    });
    return this.get(user, id);
  }

  private mustOpen(round: Round) {
    if (round.status !== 'open')
      throw conflict('compensation_closed', 'This round no longer accepts changes');
  }

  private async validateBudgets(
    tx: Tx,
    companyId: string,
    budgets: CompensationCreateInput['budgets'],
  ) {
    if (
      budgets.filter((b) => b.orgUnitId === null).length !== 1 ||
      new Set(budgets.map((b) => b.orgUnitId)).size !== budgets.length
    )
      throw badRequest('compensation_budget', 'Set one company budget and at most one per unit');
    const units = await tx
      .select({ id: orgUnits.id })
      .from(orgUnits)
      .where(eq(orgUnits.legalEntityId, companyId));
    if (budgets.some((b) => b.orgUnitId !== null && !units.some((u) => u.id === b.orgUnitId)))
      throw badRequest('compensation_budget', 'A budget unit must belong to the company');
  }

  private async view(tx: Tx, user: AuthUser, round: Round): Promise<CompensationRoundView> {
    const access = await this.access(tx, user, round.legalEntityId);
    const [company] = await tx
      .select({ id: legalEntities.id, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.id, round.legalEntityId));
    const rows = await tx
      .select({
        line: compensationLines,
        employee: employees,
        job: jobAssignments,
        unit: { id: orgUnits.id, name: orgUnits.name },
        grade: { id: grades.id, name: grades.name },
        payStatus: employeePay.status,
      })
      .from(compensationLines)
      .innerJoin(employees, eq(employees.id, compensationLines.employeeId))
      .innerJoin(jobAssignments, eq(jobAssignments.id, compensationLines.jobId))
      .leftJoin(orgUnits, eq(orgUnits.id, compensationLines.orgUnitId))
      .leftJoin(grades, eq(grades.id, jobAssignments.gradeId))
      .leftJoin(employeePay, eq(employeePay.id, compensationLines.payChangeId))
      .where(eq(compensationLines.roundId, round.id))
      .orderBy(employees.employeeCode);
    const reports = access.employeeId
      ? await tx
          .select({ id: jobAssignments.employeeId })
          .from(jobAssignments)
          .where(and(eq(jobAssignments.managerId, access.employeeId), inForceOn(todayIn())))
      : [];
    const { open } = sealed(this.cipher);
    const lines: CompensationLineView[] = rows
      .filter(
        ({ line }) =>
          access.manage ||
          (line.employeeId !== access.employeeId && reports.some((r) => r.id === line.employeeId)),
      )
      .map(({ line, employee, unit, grade, payStatus }) => ({
        ...open<CompensationAmounts>(CIPHER_FIELDS.compensationAmounts, line.amountsEnc),
        id: line.id,
        employee: employeeRef(employee),
        orgUnit: unit,
        grade,
        rating: line.rating,
        incrementRecommended: line.incrementRecommended,
        submitted: line.submitted,
        reason: line.reason,
        version: line.version,
        payChangeId: line.payChangeId,
        payStatus,
        canEdit:
          round.status === 'open' &&
          line.employeeId !== access.employeeId &&
          (access.manage || !line.submitted),
      }));
    const budgets = access.manage
      ? budgetUse(
          round.budgets,
          rows.map(({ line }) => ({
            orgUnitId: line.orgUnitId,
            ...open<CompensationAmounts>(CIPHER_FIELDS.compensationAmounts, line.amountsEnc),
          })),
        )
      : [];
    return {
      id: round.id,
      name: round.name,
      company: company!,
      effectiveFrom: round.effectiveFrom,
      status: round.status,
      people: lines.length,
      submitted: lines.filter((l) => l.submitted).length,
      cycleId: round.cycleId,
      rmgAnnual: round.rmgAnnual,
      manage: access.manage,
      lines,
      budgets,
      monthlyIncrease: money(
        lines.reduce((sum, l) => sum.plus(l.grossAfter).minus(l.grossBefore), new Decimal(0)),
      ),
      skipped: access.manage ? round.skipped : [],
    };
  }
}
