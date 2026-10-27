import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  designations,
  employees,
  jobAssignments,
  leaveRequests,
  leaveTypes,
  legalEntities,
  maternityCases,
  maternityPayments,
  payrollRunItems,
  payrollRuns,
  separations,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  Decimal,
  formatAddress,
  money,
  todayIn,
  type MaternityAverageInput,
  type MaternityAverageView,
  type MaternityCandidate,
  type MaternityCaseInput,
  type MaternityCaseStatus,
  type MaternityCaseSummary,
  type MaternityCaseView,
  type MaternityDatesInput,
  type MaternityLeaveRef,
  type MaternityPartView,
  type MaternityPaymentInput,
  type MaternityWageMonth,
  type PayLineView,
  type RunVariables,
} from '@gp/shared';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { mustChangeEmployee } from '../access-scopes/employee-scope.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { PdfService } from '../letters/pdf.service.js';
import { sealed, workingDaysAfter } from '../payroll/run-context.js';
import {
  averageWageOf,
  clockOf,
  deliveryOf,
  eligibilityOf,
  maternityRules,
  monthsIn,
  partAmount,
  partStatus,
  planParts,
  proofDeadlineOf,
  protectedWindow,
  wageWindow,
  type MaternityRules,
} from './benefit.js';
import { statementHtml } from './statement.js';

type CaseRow = typeof maternityCases.$inferSelect;
type PaymentRow = typeof maternityPayments.$inferSelect;
type EmployeeRow = typeof employees.$inferSelect;

/** How the average daily wage was found, kept with the case so its statement never shifts. */
interface WageWorking {
  windowStart: string;
  windowEnd: string;
  months: MaternityWageMonth[];
  missingMonths: string[];
  wages: string | null;
  /** Why HR entered the average by hand; null when it came from locked pay. */
  reason: string | null;
}

interface Average {
  working: WageWorking;
  workedDays: number | null;
  averageDailyWage: string;
}

const payer = alias(tenantUsers, 'payer');
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Separations that end her employment against her will (s.50); a resignation does not. */
const DISMISSALS = ['termination', 'dismissal', 'discharge', 'retrenchment'] as const;

/**
 * Maternity benefit cases (Labour Act Chapter IV). HR opens a case at the notice; the case
 * works out eligibility, the average daily wage and the parts with their due dates, which
 * move as the delivery and proof of birth are recorded. Payroll treats the linked leave as
 * unpaid while the case is eligible, since the benefit is paid instead of wages.
 */
@Injectable()
export class MaternityService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly calendars: WorkCalendarService,
    private readonly pdf: PdfService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────
  // A login limited to some companies sees only their women's cases; others are not found.

  list(user: AuthUser, status?: MaternityCaseStatus): Promise<MaternityCaseSummary[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ c: maternityCases, e: employees })
        .from(maternityCases)
        .innerJoin(employees, eq(employees.id, maternityCases.employeeId))
        .where(
          and(
            status ? eq(maternityCases.status, status) : undefined,
            await entityScope(tx, user, maternityCases.employeeId),
          ),
        )
        .orderBy(desc(maternityCases.expectedDeliveryOn));
      const payments = rows.length
        ? await tx
            .select()
            .from(maternityPayments)
            .where(
              inArray(
                maternityPayments.caseId,
                rows.map((r) => r.c.id),
              ),
            )
        : [];
      const today = todayIn();
      return rows.map(({ c, e }) =>
        this.summaryOf(
          c,
          e,
          this.partsOf(
            c,
            payments.filter((p) => p.caseId === c.id),
            today,
          ),
        ),
      );
    });
  }

  view(user: AuthUser, id: string): Promise<MaternityCaseView> {
    return this.tenantDb.run(async (tx) => this.viewOf(tx, await this.caseOf(tx, user, id)));
  }

  /** Women in active employment, for opening a case. */
  candidates(user: AuthUser, search?: string): Promise<MaternityCandidate[]> {
    return this.tenantDb.run(async (tx) => {
      const like = search ? `%${escapeLike(search)}%` : null;
      const rows = await tx
        .select({ e: employees, openCaseId: maternityCases.id })
        .from(employees)
        .leftJoin(
          maternityCases,
          and(eq(maternityCases.employeeId, employees.id), eq(maternityCases.status, 'open')),
        )
        .where(
          and(
            eq(employees.gender, 'female'),
            eq(employees.status, 'active'),
            await entityScope(tx, user, employees.id),
            like
              ? or(
                  ilike(employees.fullName, like),
                  ilike(employees.fullNameBn, like),
                  ilike(employees.employeeCode, like),
                )
              : undefined,
          ),
        )
        .orderBy(asc(employees.fullName))
        .limit(50);
      return rows.map(({ e, openCaseId }) => ({
        ...employeeRef(e),
        joinedOn: e.joinedOn,
        openCaseId,
      }));
    });
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /** Opens a case at her notice (s.47(1)), working out what is owed and when. */
  async open(user: AuthUser, input: MaternityCaseInput): Promise<MaternityCaseView> {
    const id = await this.tenantDb.run(async (tx) => {
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, input.employeeId))
        .for('update');
      if (!employee) throw new NotFoundException('Employee not found');
      await mustChangeEmployee(tx, user, employee.id);
      if (employee.gender !== 'female') {
        throw badRequest('maternity_women_only', 'Maternity benefit is for women employees');
      }
      if (employee.status !== 'active') {
        throw badRequest('maternity_employee_separated', 'This employee has separated');
      }
      const [open] = await tx
        .select({ id: maternityCases.id })
        .from(maternityCases)
        .where(and(eq(maternityCases.employeeId, employee.id), eq(maternityCases.status, 'open')));
      if (open) throw conflict('maternity_case_open', 'She already has an open maternity case');
      notInFuture(input.noticeOn, input.deliveredOn, input.proofOn);
      if (input.leaveRequestId) await this.checkLeave(tx, employee.id, input.leaveRequestId, null);

      const dates = {
        noticeOn: input.noticeOn,
        expectedDeliveryOn: input.expectedDeliveryOn,
        deliveredOn: input.deliveredOn ?? null,
        proofOn: input.proofOn ?? null,
      };
      const rules = maternityRules(deliveryOf(dates));
      const eligibility = eligibilityOf(
        {
          joinedOn: employee.joinedOn,
          deliveryOn: deliveryOf(dates),
          survivingChildren: input.survivingChildren,
        },
        rules,
      );
      const entered = input.averageDailyWage
        ? { amount: input.averageDailyWage, reason: input.averageReason! }
        : null;
      const average = await this.averageFor(tx, employee.id, input.noticeOn, rules, entered);
      if (eligibility.eligible && !average) {
        throw badRequest(
          'maternity_average_needed',
          'No locked pay covers the months before the notice; enter the average daily wage with a reason',
        );
      }
      const [row] = await tx
        .insert(maternityCases)
        .values({
          tenantId: currentTenantId(),
          employeeId: employee.id,
          leaveRequestId: input.leaveRequestId ?? null,
          ...dates,
          survivingChildren: input.survivingChildren,
          nomineeName: input.nomineeName ?? null,
          nomineeRelation: input.nomineeRelation ?? null,
          paymentOption: input.paymentOption,
          eligible: eligibility.eligible,
          ineligibleReason: eligibility.reasons.join(',') || null,
          ...this.averageColumns(average),
          benefitDays: rules.benefitDays.value,
          note: input.note ?? null,
          createdBy: user.id,
        })
        .returning();
      await this.syncParts(tx, row!);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.open',
        entityType: 'maternity_case',
        entityId: row!.id,
        after: {
          employeeId: employee.id,
          ...dates,
          survivingChildren: input.survivingChildren,
          paymentOption: input.paymentOption,
          eligible: eligibility.eligible,
          average: average ? (average.working.reason ? 'entered' : 'payroll') : null,
          leaveRequestId: input.leaveRequestId ?? null,
        },
      });
      return row!.id;
    });
    return this.view(user, id);
  }

  /** The delivery and proof of birth as they happen; due dates and lost parts follow. */
  async updateDates(
    user: AuthUser,
    id: string,
    input: MaternityDatesInput,
  ): Promise<MaternityCaseView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.openCase(tx, user, id);
      notInFuture(input.deliveredOn, input.proofOn);
      const dates = {
        noticeOn: row.noticeOn,
        expectedDeliveryOn: input.expectedDeliveryOn ?? row.expectedDeliveryOn,
        deliveredOn: input.deliveredOn,
        proofOn: input.proofOn,
      };
      const paid = await this.paidParts(tx, row);
      if (!dates.proofOn && paid.some((p) => p.basis !== 'certificate')) {
        throw conflict(
          'maternity_part_paid',
          'A part paid on proof of birth needs the proof to stay',
        );
      }
      const [employee] = await tx.select().from(employees).where(eq(employees.id, row.employeeId));
      const rules = maternityRules(deliveryOf(dates));
      const eligibility = eligibilityOf(
        {
          joinedOn: employee!.joinedOn,
          deliveryOn: deliveryOf(dates),
          survivingChildren: row.survivingChildren,
        },
        rules,
      );
      let average: Average | null | undefined;
      // Turning eligible on a later delivery: work the average out if it is still missing.
      if (eligibility.eligible && !row.averageDailyWageEnc) {
        average = await this.averageFor(tx, row.employeeId, row.noticeOn, rules, null);
      }
      const [updated] = await tx
        .update(maternityCases)
        .set({
          expectedDeliveryOn: dates.expectedDeliveryOn,
          deliveredOn: dates.deliveredOn,
          proofOn: dates.proofOn,
          eligible: eligibility.eligible,
          ineligibleReason: eligibility.reasons.join(',') || null,
          benefitDays: rules.benefitDays.value,
          ...(average ? this.averageColumns(average) : {}),
          updatedAt: new Date(),
        })
        .where(eq(maternityCases.id, row.id))
        .returning();
      await this.syncParts(tx, updated!);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.dates',
        entityType: 'maternity_case',
        entityId: row.id,
        before: {
          expectedDeliveryOn: row.expectedDeliveryOn,
          deliveredOn: row.deliveredOn,
          proofOn: row.proofOn,
        },
        after: {
          expectedDeliveryOn: dates.expectedDeliveryOn,
          deliveredOn: dates.deliveredOn,
          proofOn: dates.proofOn,
          eligible: eligibility.eligible,
        },
      });
    });
    return this.view(user, id);
  }

  /** Works the average out again from locked pay, or takes HR's figure when there is none. */
  async setAverage(
    user: AuthUser,
    id: string,
    input: MaternityAverageInput,
  ): Promise<MaternityCaseView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.openCase(tx, user, id);
      if ((await this.paidParts(tx, row)).length) {
        throw conflict('maternity_part_paid', 'A part is already paid at this average');
      }
      const rules = maternityRules(deliveryOf(row));
      const entered = input.averageDailyWage
        ? { amount: input.averageDailyWage, reason: input.reason! }
        : null;
      const average = await this.averageFor(tx, row.employeeId, row.noticeOn, rules, entered);
      if (!average) {
        throw badRequest(
          'maternity_no_locked_pay',
          'No locked pay covers the months before the notice; enter the average with a reason',
        );
      }
      const [updated] = await tx
        .update(maternityCases)
        .set({ ...this.averageColumns(average), updatedAt: new Date() })
        .where(eq(maternityCases.id, row.id))
        .returning();
      await this.syncParts(tx, updated!);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.average',
        entityType: 'maternity_case',
        entityId: row.id,
        after: {
          source: entered ? 'entered' : 'payroll',
          reason: entered?.reason ?? null,
          workedDays: average.workedDays,
        },
      });
    });
    return this.view(user, id);
  }

  /** Links her maternity leave, whose days payroll then does not pay as wages, or unlinks it. */
  async linkLeave(
    user: AuthUser,
    id: string,
    leaveRequestId: string | null,
  ): Promise<MaternityCaseView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.openCase(tx, user, id);
      if (leaveRequestId) await this.checkLeave(tx, row.employeeId, leaveRequestId, row.id);
      await tx
        .update(maternityCases)
        .set({ leaveRequestId, updatedAt: new Date() })
        .where(eq(maternityCases.id, row.id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.leave',
        entityType: 'maternity_case',
        entityId: row.id,
        before: { leaveRequestId: row.leaveRequestId },
        after: { leaveRequestId },
      });
    });
    return this.view(user, id);
  }

  /** Records a part as paid: when, how and the voucher or transaction reference. */
  async recordPayment(
    user: AuthUser,
    id: string,
    part: number,
    input: MaternityPaymentInput,
  ): Promise<MaternityCaseView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.openCase(tx, user, id);
      const [payment] = await tx
        .select()
        .from(maternityPayments)
        .where(and(eq(maternityPayments.caseId, row.id), eq(maternityPayments.part, part)))
        .for('update');
      if (!payment) throw new NotFoundException('Part not found');
      const view = this.partsOf(row, [payment], todayIn())[0]!;
      if (view.status === 'paid')
        throw conflict('maternity_part_paid', 'This part is already paid');
      if (view.status === 'lost') {
        throw conflict('maternity_part_lost', 'Proof of birth came too late for this part (s.47)');
      }
      if (view.status === 'waiting') {
        throw conflict(
          'maternity_part_waiting',
          'This part is not payable until proof of birth comes',
        );
      }
      notInFuture(input.paidOn);
      await tx
        .update(maternityPayments)
        .set({
          paidOn: input.paidOn,
          method: input.method,
          reference: input.reference ?? null,
          paidBy: user.id,
        })
        .where(eq(maternityPayments.id, payment.id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.pay',
        entityType: 'maternity_case',
        entityId: row.id,
        after: {
          part,
          paidOn: input.paidOn,
          method: input.method,
          reference: input.reference ?? null,
        },
      });
    });
    return this.view(user, id);
  }

  /** Closes a case once every part is paid or lost (or nothing was payable). */
  async close(user: AuthUser, id: string, note: string | null): Promise<MaternityCaseView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.openCase(tx, user, id);
      const payments = await tx
        .select()
        .from(maternityPayments)
        .where(eq(maternityPayments.caseId, row.id));
      const left = this.partsOf(row, payments, todayIn()).filter(
        (p) => p.status !== 'paid' && p.status !== 'lost',
      );
      if (row.eligible && (left.length || payments.length === 0)) {
        throw conflict(
          'maternity_parts_unpaid',
          'Pay every part of the benefit before closing the case',
        );
      }
      await this.setStatus(tx, row, 'closed', note);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.close',
        entityType: 'maternity_case',
        entityId: row.id,
        after: { status: 'closed', note },
      });
    });
    return this.view(user, id);
  }

  /** Cancels a case opened in error, before anything is paid; its leave is paid as wages again. */
  async cancel(user: AuthUser, id: string, reason: string): Promise<MaternityCaseView> {
    await this.tenantDb.run(async (tx) => {
      const row = await this.openCase(tx, user, id);
      if ((await this.paidParts(tx, row)).length) {
        throw conflict(
          'maternity_part_paid',
          'A part is already paid, so the case cannot be cancelled',
        );
      }
      await this.setStatus(tx, row, 'cancelled', reason);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'maternity.cancel',
        entityType: 'maternity_case',
        entityId: row.id,
        after: { status: 'cancelled', reason },
      });
    });
    return this.view(user, id);
  }

  /** The case as a statement for her and the file, in English or Bangla. */
  async statement(user: AuthUser, id: string, language: 'en' | 'bn') {
    const html = await this.tenantDb.run(async (tx) => {
      const row = await this.caseOf(tx, user, id);
      const view = await this.viewOf(tx, row);
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
            eq(jobAssignments.employeeId, row.employeeId),
            lte(jobAssignments.effectiveFrom, row.noticeOn),
          ),
        )
        .orderBy(desc(jobAssignments.effectiveFrom))
        .limit(1);
      const bn = language === 'bn';
      return statementHtml({
        language,
        company: {
          name: job?.entity.legalName ?? job?.entity.name ?? '',
          details: job?.entity.address ? formatAddress(job.entity.address, language) : '',
        },
        employee: {
          code: view.employee.employeeCode,
          name: bn && view.employee.fullNameBn ? view.employee.fullNameBn : view.employee.fullName,
          designation: (bn ? job?.designationBn : null) ?? job?.designation ?? null,
        },
        maternity: view,
        issuedOn: todayIn(),
      });
    });
    return {
      bytes: await this.pdf.render(html),
      fileName: `maternity-statement-${language}.pdf`,
    };
  }

  // ── Working it out ─────────────────────────────────────────────────────────

  /**
   * s.48: the wages she earned in the calendar months before the notice month, over the days
   * she actually worked, from locked regular and adjustment runs (bonus, settlement and fund
   * runs are not wages for the period). HR's figure only where locked pay gives none.
   */
  private async averageFor(
    tx: Tx,
    employeeId: string,
    noticeOn: string,
    rules: MaternityRules,
    entered: { amount: string; reason: string } | null,
  ): Promise<Average | null> {
    const window = wageWindow(noticeOn, rules.averageMonths.value);
    const rows = await tx
      .select({
        runId: payrollRuns.id,
        parentRunId: payrollRuns.parentRunId,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        lockedAt: payrollRuns.lockedAt,
        resultEnc: payrollRunItems.resultEnc,
      })
      .from(payrollRunItems)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunItems.runId))
      .where(
        and(
          eq(payrollRunItems.employeeId, employeeId),
          eq(payrollRunItems.status, 'ok'),
          eq(payrollRuns.status, 'locked'),
          inArray(payrollRuns.kind, ['regular', 'adjustment']),
          gte(payrollRuns.periodStart, window.start),
          lte(payrollRuns.periodEnd, window.end),
        ),
      );
    const { open } = sealed(this.cipher);
    const found = averageWageOf(
      rows.map((r) => {
        const result = open<{ lines: PayLineView[]; variables: RunVariables }>(
          CIPHER_FIELDS.runResults,
          r.resultEnc,
        );
        return {
          periodRunId: r.parentRunId ?? r.runId,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          lockedAt: r.lockedAt ?? new Date(0),
          lines: result.lines,
          workedDays: result.variables.workedDays,
        };
      }),
      window,
    );
    const windowOf = { windowStart: window.start, windowEnd: window.end };
    if (entered) {
      if (found) {
        throw conflict(
          'maternity_average_from_payroll',
          'Locked pay covers the months before the notice, so the average comes from it',
        );
      }
      return {
        working: {
          ...windowOf,
          months: [],
          missingMonths: monthsIn(window),
          wages: null,
          reason: entered.reason,
        },
        workedDays: null,
        averageDailyWage: money(entered.amount),
      };
    }
    if (!found) return null;
    return {
      working: {
        ...windowOf,
        months: found.months,
        missingMonths: found.missingMonths,
        wages: found.wages,
        reason: null,
      },
      workedDays: found.workedDays,
      averageDailyWage: found.averageDailyWage,
    };
  }

  private averageColumns(average: Average | null) {
    const { seal } = sealed(this.cipher);
    return {
      wageTotalEnc: average ? seal(CIPHER_FIELDS.maternityWages, average.working) : null,
      wageDaysWorked: average?.workedDays ?? null,
      averageDailyWageEnc: average
        ? seal(CIPHER_FIELDS.maternityWages, average.averageDailyWage)
        : null,
    };
  }

  /**
   * Brings the parts in line with the case: the option's parts at the average wage, each due
   * a number of working days after its certificate or proof (or eight weeks after proof).
   * Paid parts never change; parts no longer owed are removed.
   */
  private async syncParts(tx: Tx, row: CaseRow) {
    const existing = await tx
      .select()
      .from(maternityPayments)
      .where(eq(maternityPayments.caseId, row.id));
    const { seal, open } = sealed(this.cipher);
    const rules = maternityRules(deliveryOf(row));
    const plan =
      row.eligible && row.averageDailyWageEnc
        ? planParts(row.paymentOption, row.benefitDays, rules.daysBefore.value)
        : [];
    const average = row.averageDailyWageEnc
      ? open<string>(CIPHER_FIELDS.maternityWages, row.averageDailyWageEnc)
      : null;
    const today = todayIn();
    for (const p of plan) {
      const found = existing.find((e) => e.part === p.part);
      if (found?.paidOn) continue;
      const { from } = clockOf(p.basis, row, rules, today);
      const dueOn =
        from === null
          ? null
          : p.basis === 'after_proof'
            ? addDays(from, rules.secondPartAfterProofDays.value)
            : await workingDaysAfter(tx, this.calendars, from, rules.paymentWorkingDays.value);
      const values = {
        days: p.days,
        amountEnc: seal(CIPHER_FIELDS.maternityPayments, partAmount(average!, p.days)),
        dueOn,
      };
      if (found) {
        await tx.update(maternityPayments).set(values).where(eq(maternityPayments.id, found.id));
      } else {
        await tx
          .insert(maternityPayments)
          .values({ tenantId: currentTenantId(), caseId: row.id, part: p.part, ...values });
      }
    }
    const stale = existing.filter((e) => !e.paidOn && !plan.some((p) => p.part === e.part));
    if (stale.length) {
      await tx.delete(maternityPayments).where(
        inArray(
          maternityPayments.id,
          stale.map((e) => e.id),
        ),
      );
    }
  }

  /** The parts with their basis and status today; paid ones keep what was paid. */
  private partsOf(
    row: CaseRow,
    payments: (PaymentRow & { paidByName?: string | null })[],
    today: string,
  ): MaternityPartView[] {
    const { open } = sealed(this.cipher);
    const rules = maternityRules(deliveryOf(row));
    const plan = planParts(row.paymentOption, row.benefitDays, rules.daysBefore.value);
    return payments
      .toSorted((a, b) => a.part - b.part)
      .map((p) => {
        const planned = plan.find((x) => x.part === p.part) ?? plan[0]!;
        const { lost } = clockOf(planned.basis, row, rules, today);
        return {
          id: p.id,
          part: p.part,
          covers: planned.covers,
          days: p.days,
          amount: open<string>(CIPHER_FIELDS.maternityPayments, p.amountEnc),
          basis: planned.basis,
          status: partStatus({ paidOn: p.paidOn, dueOn: p.dueOn, lost }, today),
          dueOn: p.dueOn,
          paidOn: p.paidOn,
          method: p.method,
          reference: p.reference,
          paidBy: p.paidByName ?? null,
        };
      });
  }

  private summaryOf(
    row: CaseRow,
    employee: EmployeeRow,
    parts: MaternityPartView[],
  ): MaternityCaseSummary {
    const payable = parts.filter((p) => p.status === 'due' || p.status === 'overdue');
    const next =
      payable.toSorted((a, b) => a.dueOn!.localeCompare(b.dueOn!))[0] ??
      parts.find((p) => p.status === 'waiting');
    return {
      id: row.id,
      employee: employeeRef(employee),
      noticeOn: row.noticeOn,
      expectedDeliveryOn: row.expectedDeliveryOn,
      deliveredOn: row.deliveredOn,
      proofOn: row.proofOn,
      paymentOption: row.paymentOption,
      status: row.status,
      eligible: row.eligible,
      benefitDays: row.benefitDays,
      total: parts.length ? money(parts.reduce((s, p) => s.plus(p.amount), new Decimal(0))) : null,
      next:
        next && row.status === 'open'
          ? { part: next.part, status: next.status, dueOn: next.dueOn, amount: next.amount }
          : null,
    };
  }

  private async viewOf(tx: Tx, row: CaseRow): Promise<MaternityCaseView> {
    const today = todayIn();
    const [employee] = await tx.select().from(employees).where(eq(employees.id, row.employeeId));
    const payments = await tx
      .select({ p: maternityPayments, paidByName: payer.name })
      .from(maternityPayments)
      .leftJoin(payer, eq(payer.id, maternityPayments.paidBy))
      .where(eq(maternityPayments.caseId, row.id));
    const parts = this.partsOf(
      row,
      payments.map(({ p, paidByName }) => ({ ...p, paidByName })),
      today,
    );
    const rules = maternityRules(deliveryOf(row));
    const eligibility = eligibilityOf(
      {
        joinedOn: employee!.joinedOn,
        deliveryOn: deliveryOf(row),
        survivingChildren: row.survivingChildren,
      },
      rules,
    );
    const window = protectedWindow(deliveryOf(row), rules);
    const noticed = await tx
      .select()
      .from(separations)
      .where(
        and(
          eq(separations.employeeId, row.employeeId),
          inArray(separations.type, [...DISMISSALS]),
          ne(separations.status, 'cancelled'),
          gte(separations.noticeDate, window.from),
          lte(separations.noticeDate, window.to),
        ),
      );
    const leave = await this.maternityLeaveOf(tx, row.employeeId, row.id);
    const proofDeadline = proofDeadlineOf(row, rules);
    return {
      ...this.summaryOf(row, employee!, parts),
      employee: {
        ...employeeRef(employee!),
        joinedOn: employee!.joinedOn,
        separatedOn: employee!.separatedOn,
        status: employee!.status,
      },
      survivingChildren: row.survivingChildren,
      nomineeName: row.nomineeName,
      nomineeRelation: row.nomineeRelation,
      note: row.note,
      eligibility,
      daysBefore: rules.daysBefore.value,
      daysAfter: row.benefitDays - rules.daysBefore.value,
      rules: {
        benefitDays: rules.benefitDays,
        daysBefore: rules.daysBefore,
        paymentWorkingDays: rules.paymentWorkingDays,
        proofWithinMonths: rules.proofWithinMonths,
      },
      average: this.averageView(row, rules),
      parts,
      proofDeadline,
      proofLate: row.proofOn ? row.proofOn > proofDeadline : today > proofDeadline,
      protection: {
        ...window,
        rules: [rules.protectedMonthsBefore, rules.protectedDaysAfter],
        separations: noticed.map((s) => ({
          id: s.id,
          type: s.type,
          noticeDate: s.noticeDate,
          status: s.status,
        })),
      },
      leaveRequest: leave.find((l) => l.id === row.leaveRequestId) ?? null,
      leaveOptions: leave.filter((l) => l.id !== row.leaveRequestId),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private averageView(row: CaseRow, rules: MaternityRules): MaternityAverageView | null {
    if (!row.averageDailyWageEnc || !row.wageTotalEnc) return null;
    const { open } = sealed(this.cipher);
    const working = open<WageWorking>(CIPHER_FIELDS.maternityWages, row.wageTotalEnc);
    return {
      source: working.reason ? 'entered' : 'payroll',
      windowStart: working.windowStart,
      windowEnd: working.windowEnd,
      months: working.months,
      missingMonths: working.missingMonths,
      wages: working.wages,
      workedDays: row.wageDaysWorked,
      averageDailyWage: open<string>(CIPHER_FIELDS.maternityWages, row.averageDailyWageEnc),
      reason: working.reason,
      rule: rules.averageMonths,
    };
  }

  /** Her maternity leave that is not cancelled or refused, and not linked to another case. */
  private async maternityLeaveOf(
    tx: Tx,
    employeeId: string,
    caseId: string | null,
  ): Promise<MaternityLeaveRef[]> {
    const rows = await tx
      .select({
        id: leaveRequests.id,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        status: leaveRequests.status,
        linkedTo: maternityCases.id,
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .leftJoin(
        maternityCases,
        and(
          eq(maternityCases.leaveRequestId, leaveRequests.id),
          ne(maternityCases.status, 'cancelled'),
        ),
      )
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveTypes.statutoryKey, 'maternity'),
          inArray(leaveRequests.status, ['pending', 'approved']),
        ),
      )
      .orderBy(desc(leaveRequests.startDate));
    return rows
      .filter((r) => r.linkedTo === null || r.linkedTo === caseId)
      .map(({ linkedTo: _linked, ...r }) => r);
  }

  private async checkLeave(
    tx: Tx,
    employeeId: string,
    leaveRequestId: string,
    caseId: string | null,
  ) {
    const options = await this.maternityLeaveOf(tx, employeeId, caseId);
    if (!options.some((o) => o.id === leaveRequestId)) {
      throw badRequest(
        'maternity_leave_invalid',
        'Choose a maternity leave request of hers that is pending or approved and not linked to another case',
      );
    }
  }

  private async paidParts(tx: Tx, row: CaseRow) {
    const paid = await tx
      .select()
      .from(maternityPayments)
      .where(and(eq(maternityPayments.caseId, row.id), isNotNull(maternityPayments.paidOn)));
    return this.partsOf(row, paid, todayIn());
  }

  private async setStatus(tx: Tx, row: CaseRow, status: MaternityCaseStatus, note: string | null) {
    await tx
      .update(maternityCases)
      .set({
        status,
        note: note ? [row.note, note].filter(Boolean).join('\n') : row.note,
        updatedAt: new Date(),
      })
      .where(eq(maternityCases.id, row.id));
  }

  /** The case, when the user's companies include hers. */
  private async caseOf(tx: Tx, user: AuthUser, id: string): Promise<CaseRow> {
    const [row] = await tx
      .select()
      .from(maternityCases)
      .where(
        and(eq(maternityCases.id, id), await entityScope(tx, user, maternityCases.employeeId)),
      );
    if (!row) throw new NotFoundException('Maternity case not found');
    return row;
  }

  /** The case, locked for this change, which only an open case takes. */
  private async openCase(tx: Tx, user: AuthUser, id: string): Promise<CaseRow> {
    const [row] = await tx
      .select()
      .from(maternityCases)
      .where(and(eq(maternityCases.id, id), await entityScope(tx, user, maternityCases.employeeId)))
      .for('update');
    if (!row) throw new NotFoundException('Maternity case not found');
    if (row.status !== 'open')
      throw conflict('maternity_case_closed', `This case is ${row.status}`);
    return row;
  }
}

function notInFuture(...dates: (string | null | undefined)[]) {
  const today = todayIn();
  if (dates.some((d) => d && d > today)) {
    throw badRequest('maternity_future_date', 'A date that has not come yet cannot be recorded');
  }
}
