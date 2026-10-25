import { Inject, Injectable } from '@nestjs/common';
import { bdWageBoard, BD_RULES, ruleOn } from '@gp/country-packs';
import {
  attendanceDays,
  attendanceSettings,
  CIPHER_FIELDS,
  committeeMeetings,
  committeeMembers,
  committees,
  complianceAlerts,
  complianceSettings,
  employeePay,
  employees,
  grievanceMessages,
  grievances,
  holidays,
  leaveRequests,
  leaveTypes,
  legalEntities,
  locations,
  maternityCases,
  maternityPayments,
  payGroups,
  payrollRunItems,
  payrollRuns,
  salaryStructures,
  tradeUnions,
  unionMemberships,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  ageOn,
  groupBy,
  todayIn,
  weekdayOf,
  type AuditReportQuery,
  type AuditReportView,
  type ComplianceAlertKind,
  type GrievanceCategory,
  type GrievanceStatus,
  type RunVariables,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { badRequest } from '../../common/errors.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { PdfService } from '../letters/pdf.service.js';
import { csv } from '../payroll/disbursement.js';
import { minimumWageCheck, workOutPay } from '../payroll/pay-calc.js';
import { certificatesOf } from '../compliance/people.js';
import { componentsOf } from '../payroll/payroll-setup.service.js';
import { jobsOn, sealed } from '../payroll/run-context.js';
import { auditReportHtml } from './audit-report-pdf.js';

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
function countOf<K extends string>(keys: K[]) {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

/** The Saturday a day's week starts on, as the attendance summary counts weeks. */
const weekOf = (date: string) => addDays(date, -((weekdayOf(date) + 1) % 7));

interface Person {
  id: string;
  code: string;
  name: string;
  gender: string;
  dateOfBirth: string;
}

/**
 * The buyer-audit report: one period and establishment, everything an auditor samples, read
 * from the same records that pay people. Nothing here is kept separately for auditors.
 */
@Injectable()
export class AuditReportService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly pdf: PdfService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  build(query: AuditReportQuery): Promise<AuditReportView> {
    return this.tenantDb.run(async (tx) => {
      const { from, to } = query;
      const people = await this.peopleIn(tx, query);
      const ids = people.map((p) => p.id);
      const [entity] = query.legalEntityId
        ? await tx.select().from(legalEntities).where(eq(legalEntities.id, query.legalEntityId))
        : [];
      const [location] = query.locationId
        ? await tx.select().from(locations).where(eq(locations.id, query.locationId))
        : [];
      if (entity && location && location.legalEntityId !== entity.id) {
        throw badRequest('scope_mismatch', 'That site is not part of that company');
      }
      const jobs = await jobsOn(tx, ids, to);
      const workers = people.filter((p) => jobs.get(p.id)?.workerCategory === 'worker');
      return {
        from,
        to,
        establishment: {
          entity: entity ? (entity.legalName ?? entity.name) : null,
          location: location?.name ?? null,
        },
        generatedAt: new Date().toISOString(),
        workforce: await this.workforce(tx, people, workers.length, to),
        ...(await this.hoursAndOvertime(tx, people, query)),
        wages: await this.wages(tx, people, query),
        leave: await this.leave(tx, ids, query),
        ...(await this.relations(tx, query)),
        grievances: await this.grievances(tx, query),
        alerts: await this.alerts(tx, ids, query),
      };
    });
  }

  async file(query: AuditReportQuery) {
    const report = await this.build(query);
    const name = `buyer-audit-${query.from}-${query.to}`;
    if (query.format === 'pdf') {
      const bytes = await this.pdf.render(auditReportHtml(report, query.language));
      return {
        bytes,
        contentType: 'application/pdf',
        fileName: `${name}${query.language === 'bn' ? '-bn' : ''}.pdf`,
      };
    }
    // The CSV is the sample auditors ask for: each person's hours week by week.
    const rows = await this.tenantDb.run((tx) => this.weeklyRows(tx, query));
    return {
      bytes: Buffer.from(
        csv([
          ['Employee code', 'Name', 'Week from', 'Days worked', 'Hours', 'Overtime hours'],
          ...rows.map((r) => [
            r.code,
            r.name,
            r.weekStart,
            String(r.days),
            String(hours(r.minutes)),
            String(hours(r.overtime)),
          ]),
        ]),
      ),
      contentType: 'text/csv; charset=utf-8',
      fileName: `${name}-hours.csv`,
    };
  }

  // ── Who is in scope ────────────────────────────────────────────────────────

  /** Everyone employed at any time in the period whose job at its end is in the establishment. */
  private async peopleIn(tx: Tx, query: AuditReportQuery): Promise<Person[]> {
    const rows = await tx
      .select({
        id: employees.id,
        code: employees.employeeCode,
        name: employees.fullName,
        gender: employees.gender,
        dateOfBirth: employees.dateOfBirth,
      })
      .from(employees)
      .where(
        and(
          lte(employees.joinedOn, query.to),
          or(isNull(employees.separatedOn), gte(employees.separatedOn, query.from)),
        ),
      )
      .orderBy(asc(employees.employeeCode));
    if (!query.legalEntityId && !query.locationId) return rows;
    const jobs = await jobsOn(
      tx,
      rows.map((r) => r.id),
      query.to,
    );
    return rows.filter((r) => {
      const job = jobs.get(r.id);
      if (query.legalEntityId && job?.entity?.id !== query.legalEntityId) return false;
      if (query.locationId && job?.locationId !== query.locationId) return false;
      return true;
    });
  }

  // ── Sections ───────────────────────────────────────────────────────────────

  private async workforce(tx: Tx, people: Person[], workers: number, on: string) {
    const adultAge = ruleOn(BD_RULES, 'adolescent.adult_age', on).value;
    const minAge = ruleOn(BD_RULES, 'adolescent.min_age', on).value;
    const young = people.filter((p) => ageOn(p.dateOfBirth, on) < adultAge);
    // Judged as the compliance pages judge them: the expiry date, else 12 months (s.37).
    const certificates = await certificatesOf(
      tx,
      young.map((p) => p.id),
      on,
    );
    const until = new Map<string, string>();
    for (const [id, c] of certificates) {
      if (c.validUntil && c.validUntil >= on) until.set(id, c.validUntil);
    }
    return {
      total: people.length,
      workers,
      staff: people.length - workers,
      women: people.filter((p) => p.gender === 'female').length,
      men: people.filter((p) => p.gender === 'male').length,
      adolescents: young
        .filter((p) => ageOn(p.dateOfBirth, on) >= minAge)
        .map((p) => ({
          code: p.code,
          name: p.name,
          age: ageOn(p.dateOfBirth, on),
          certificateUntil: until.get(p.id) ?? null,
        })),
      children: young.filter((p) => ageOn(p.dateOfBirth, on) < minAge).length,
    };
  }

  private async daysOf(tx: Tx, ids: string[], query: AuditReportQuery) {
    if (ids.length === 0) return [];
    return tx
      .select({
        employeeId: attendanceDays.employeeId,
        date: attendanceDays.date,
        workedMinutes: attendanceDays.workedMinutes,
        overtimeMinutes: attendanceDays.overtimeMinutes,
      })
      .from(attendanceDays)
      .where(
        and(
          inArray(attendanceDays.employeeId, ids),
          sql`${attendanceDays.date} between ${query.from} and ${query.to}`,
        ),
      )
      .orderBy(asc(attendanceDays.employeeId), asc(attendanceDays.date));
  }

  private async weeklyRows(tx: Tx, query: AuditReportQuery) {
    const people = await this.peopleIn(tx, query);
    const byId = new Map(people.map((p) => [p.id, p]));
    const days = await this.daysOf(
      tx,
      people.map((p) => p.id),
      query,
    );
    const weeks = new Map<
      string,
      {
        code: string;
        name: string;
        weekStart: string;
        days: number;
        minutes: number;
        overtime: number;
      }
    >();
    for (const d of days) {
      const person = byId.get(d.employeeId)!;
      const key = `${person.code}:${weekOf(d.date)}`;
      const w = weeks.get(key) ?? {
        code: person.code,
        name: person.name,
        weekStart: weekOf(d.date),
        days: 0,
        minutes: 0,
        overtime: 0,
      };
      if (d.workedMinutes > 0) w.days += 1;
      w.minutes += d.workedMinutes;
      w.overtime += d.overtimeMinutes;
      weeks.set(key, w);
    }
    return [...weeks.values()].toSorted(
      (a, b) => a.code.localeCompare(b.code) || a.weekStart.localeCompare(b.weekStart),
    );
  }

  private async hoursAndOvertime(
    tx: Tx,
    people: Person[],
    query: AuditReportQuery,
  ): Promise<Pick<AuditReportView, 'hours' | 'overtime'>> {
    const [tracking] = await tx.select().from(attendanceSettings);
    const ids = people.map((p) => p.id);
    const days = await this.daysOf(tx, ids, query);
    const weekly = await this.weeklyRows(tx, query);
    const weeklyMax = ruleOn(BD_RULES, 'work.weekly_max_hours_with_overtime', query.to).value;
    const weeklyOrdinary = ruleOn(BD_RULES, 'work.weekly_hours', query.to).value;
    const dailyMax = ruleOn(BD_RULES, 'work.daily_max_hours_with_overtime', query.to).value;

    let withoutHoliday = 0;
    const monthly = new Map<string, number>();
    for (const [employeeId, list] of groupBy(days, (d) => d.employeeId)) {
      let run = 0;
      let longest = 0;
      let previous: string | null = null;
      for (const d of list) {
        if (d.workedMinutes <= 0) {
          run = 0;
        } else {
          run = previous && daysBetween(previous, d.date) === 1 && run > 0 ? run + 1 : 1;
          longest = Math.max(longest, run);
        }
        previous = d.date;
        const key = `${employeeId}:${d.date.slice(0, 7)}`;
        monthly.set(key, (monthly.get(key) ?? 0) + d.overtimeMinutes);
      }
      if (longest >= 7) withoutHoliday += 1;
    }
    const [caps] = await tx.select().from(complianceSettings);
    const monthlyCap = caps?.overtimeMonthlyCapMinutes ?? null;
    const monthlyValues = [...monthly.values()];
    const overtimeMinutes = days.reduce((s, d) => s + d.overtimeMinutes, 0);
    const paid = await this.overtimePaid(tx, ids, query, days);
    return {
      hours: {
        tracked: !!tracking && tracking.trackingFrom <= query.to,
        workerWeeks: weekly.length,
        weeksOver48: weekly.filter((w) => w.minutes > weeklyOrdinary * 60).length,
        weeksOver60: weekly.filter((w) => w.minutes > weeklyMax * 60).length,
        maxWeeklyHours: hours(Math.max(0, ...weekly.map((w) => w.minutes))),
        averageWeeklyHours: weekly.length
          ? hours(weekly.reduce((s, w) => s + w.minutes, 0) / weekly.length)
          : 0,
        daysOver10: days.filter((d) => d.workedMinutes > dailyMax * 60).length,
        withoutWeeklyHoliday: withoutHoliday,
        longest: weekly
          .toSorted((a, b) => b.minutes - a.minutes)
          .slice(0, 10)
          .map((w) => ({
            code: w.code,
            name: w.name,
            weekStart: w.weekStart,
            hours: hours(w.minutes),
            overtime: hours(w.overtime),
          })),
      },
      overtime: {
        totalHours: hours(overtimeMinutes),
        people: new Set(days.filter((d) => d.overtimeMinutes > 0).map((d) => d.employeeId)).size,
        maxMonthlyHours: hours(Math.max(0, ...monthlyValues)),
        averageMonthlyHours: monthlyValues.length
          ? hours(monthlyValues.reduce((s, v) => s + v, 0) / monthlyValues.length)
          : 0,
        monthlyCapHours: monthlyCap === null ? null : hours(monthlyCap),
        overMonthlyCap:
          monthlyCap === null ? 0 : monthlyValues.filter((v) => v > monthlyCap).length,
        paid,
      },
    };
  }

  /** Overtime in locked regular runs within the period against what attendance recorded. */
  private async overtimePaid(
    tx: Tx,
    ids: string[],
    query: AuditReportQuery,
    days: { employeeId: string; date: string; overtimeMinutes: number }[],
  ) {
    const runs = await tx
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.kind, 'regular'),
          eq(payrollRuns.status, 'locked'),
          gte(payrollRuns.periodStart, query.from),
          lte(payrollRuns.periodEnd, query.to),
        ),
      );
    if (runs.length === 0 || ids.length === 0) {
      return { runs: runs.length, recordedHours: 0, paidHours: 0, differences: 0 };
    }
    const { open } = sealed(this.cipher);
    const items = await tx
      .select()
      .from(payrollRunItems)
      .where(
        and(
          inArray(
            payrollRunItems.runId,
            runs.map((r) => r.id),
          ),
          inArray(payrollRunItems.employeeId, ids),
          eq(payrollRunItems.status, 'ok'),
        ),
      );
    const periodOf = new Map(runs.map((r) => [r.id, r]));
    let recorded = 0;
    let paidHours = 0;
    let differences = 0;
    for (const item of items) {
      const run = periodOf.get(item.runId)!;
      const result = open<{ variables: RunVariables }>(CIPHER_FIELDS.runResults, item.resultEnc);
      const minutes = days
        .filter(
          (d) =>
            d.employeeId === item.employeeId &&
            d.date >= run.periodStart &&
            d.date <= run.periodEnd,
        )
        .reduce((s, d) => s + d.overtimeMinutes, 0);
      recorded += minutes;
      paidHours += result.variables.otHours;
      if (Math.abs(hours(minutes) - result.variables.otHours) >= 0.1) differences += 1;
    }
    return {
      runs: runs.length,
      recordedHours: hours(recorded),
      paidHours: Math.round(paidHours * 10) / 10,
      differences,
    };
  }

  private async wages(
    tx: Tx,
    people: Person[],
    query: AuditReportQuery,
  ): Promise<AuditReportView['wages']> {
    const runs = await tx
      .select({ run: payrollRuns, group: payGroups.name })
      .from(payrollRuns)
      .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
      .where(
        and(
          inArray(payrollRuns.status, ['pending', 'locked']),
          ne(payrollRuns.kind, 'wppf'),
          gte(payrollRuns.periodStart, query.from),
          lte(payrollRuns.periodEnd, query.to),
        ),
      )
      .orderBy(asc(payrollRuns.periodStart));
    const today = todayIn();
    // Pay in force at the end of the period, against the wage board in force then.
    const ids = people.map((p) => p.id);
    const pay = ids.length
      ? await tx
          .select({ p: employeePay, structure: salaryStructures })
          .from(employeePay)
          .innerJoin(salaryStructures, eq(salaryStructures.id, employeePay.structureId))
          .where(
            and(
              inArray(employeePay.employeeId, ids),
              eq(employeePay.status, 'approved'),
              lte(employeePay.effectiveFrom, query.to),
            ),
          )
          .orderBy(asc(employeePay.effectiveFrom))
      : [];
    const latest = new Map<string, (typeof pay)[number]>();
    for (const row of pay) latest.set(row.p.employeeId, row);
    const components = await componentsOf(tx);
    const { open } = sealed(this.cipher);
    const byId = new Map(people.map((p) => [p.id, p]));
    let onBoard = 0;
    const below: AuditReportView['wages']['belowMinimum'] = [];
    for (const [employeeId, { p, structure }] of latest) {
      if (!structure.wageBoard || !p.wageGrade) continue;
      onBoard += 1;
      const amounts = open<{ amount: string; fixed: Record<string, string> }>(
        CIPHER_FIELDS.payAmounts,
        p.amountsEnc,
      );
      const result = workOutPay(structure, components, amounts.amount, amounts.fixed);
      const check = minimumWageCheck(structure, p.wageGrade, query.to, result);
      if (check && !check.meets) {
        const person = byId.get(employeeId)!;
        below.push({
          code: person.code,
          name: person.name,
          grade: p.wageGrade,
          gross: result.gross,
          minimumGross: check.minimumGross,
          board: bdWageBoard(check.board)?.name ?? check.board,
        });
      }
    }
    return {
      runs: runs.map(({ run, group }) => ({
        period: `${run.periodStart} – ${run.periodEnd}`,
        payGroup: group,
        kind: run.kind,
        status: run.status,
        paymentDue: run.paymentDue,
        paidOn: run.paidOn,
        late: run.paidOn ? run.paidOn > run.paymentDue : run.paymentDue < today,
      })),
      onWageBoard: onBoard,
      belowMinimum: below,
    };
  }

  private async leave(
    tx: Tx,
    ids: string[],
    query: AuditReportQuery,
  ): Promise<AuditReportView['leave']> {
    const taken = ids.length
      ? await tx
          .select({
            code: leaveTypes.code,
            name: leaveTypes.name,
            days: sql<string>`sum(${leaveRequests.days})::text`,
            people: sql<number>`count(distinct ${leaveRequests.employeeId})::int`,
          })
          .from(leaveRequests)
          .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
          .where(
            and(
              inArray(leaveRequests.employeeId, ids),
              eq(leaveRequests.status, 'approved'),
              sql`${leaveRequests.startDate} between ${query.from} and ${query.to}`,
            ),
          )
          .groupBy(leaveTypes.code, leaveTypes.name)
          .orderBy(asc(leaveTypes.code))
      : [];
    const [festival] = await tx
      .select({ n: sql<number>`count(distinct ${holidays.date})::int` })
      .from(holidays)
      .where(
        and(
          eq(holidays.kind, 'festival'),
          sql`${holidays.date} between ${query.from} and ${query.to}`,
        ),
      );
    const cases = ids.length
      ? await tx
          .select({ id: maternityCases.id, eligible: maternityCases.eligible })
          .from(maternityCases)
          .where(
            and(
              inArray(maternityCases.employeeId, ids),
              ne(maternityCases.status, 'cancelled'),
              lte(maternityCases.noticeOn, query.to),
              gte(maternityCases.expectedDeliveryOn, addDays(query.from, -120)),
            ),
          )
      : [];
    const parts = cases.length
      ? await tx
          .select({ dueOn: maternityPayments.dueOn, paidOn: maternityPayments.paidOn })
          .from(maternityPayments)
          .where(
            and(
              inArray(
                maternityPayments.caseId,
                cases.map((c) => c.id),
              ),
              sql`${maternityPayments.dueOn} between ${query.from} and ${query.to}`,
            ),
          )
      : [];
    const today = todayIn();
    return {
      byType: taken.map((t) => ({
        code: t.code,
        name: t.name,
        days: Number(t.days),
        people: t.people,
      })),
      festivalHolidays: festival?.n ?? 0,
      maternity: {
        cases: cases.length,
        eligible: cases.filter((c) => c.eligible).length,
        partsDue: parts.length,
        paidOnTime: parts.filter((p) => p.paidOn && p.dueOn && p.paidOn <= p.dueOn).length,
        paidLate: parts.filter((p) => p.paidOn && p.dueOn && p.paidOn > p.dueOn).length,
        overdue: parts.filter((p) => !p.paidOn && p.dueOn && p.dueOn < today).length,
      },
    };
  }

  private async relations(
    tx: Tx,
    query: AuditReportQuery,
  ): Promise<Pick<AuditReportView, 'committees' | 'unions'>> {
    const inScope = <T extends { legalEntityId: string | null; locationId?: string | null }>(
      row: T,
    ) =>
      (!query.legalEntityId || !row.legalEntityId || row.legalEntityId === query.legalEntityId) &&
      (!query.locationId || !row.locationId || row.locationId === query.locationId);
    const list = (await tx.select().from(committees).orderBy(asc(committees.kind))).filter(inScope);
    const members = list.length
      ? await tx
          .select()
          .from(committeeMembers)
          .where(
            inArray(
              committeeMembers.committeeId,
              list.map((c) => c.id),
            ),
          )
      : [];
    const meetings = list.length
      ? await tx
          .select()
          .from(committeeMeetings)
          .where(
            inArray(
              committeeMeetings.committeeId,
              list.map((c) => c.id),
            ),
          )
      : [];
    const current = (m: (typeof members)[number]) =>
      m.fromOn <= query.to && (!m.toOn || m.toOn >= query.to);
    const unions = (await tx.select().from(tradeUnions)).filter(inScope);
    const counts = unions.length
      ? await tx
          .select({
            unionId: unionMemberships.unionId,
            n: sql<number>`count(*)::int`,
          })
          .from(unionMemberships)
          .where(
            and(
              inArray(
                unionMemberships.unionId,
                unions.map((u) => u.id),
              ),
              lte(unionMemberships.joinedOn, query.to),
              or(isNull(unionMemberships.leftOn), gte(unionMemberships.leftOn, query.to)),
            ),
          )
          .groupBy(unionMemberships.unionId)
      : [];
    return {
      committees: list.map((c) => {
        const mine = members.filter((m) => m.committeeId === c.id && current(m));
        const held = meetings.filter((m) => m.committeeId === c.id && m.heldOn <= query.to);
        return {
          kind: c.kind,
          name: c.name,
          formedOn: c.formedOn,
          endsOn: c.endsOn,
          workerMembers: mine.filter((m) => m.side === 'worker').length,
          employerMembers: mine.filter((m) => m.side === 'employer').length,
          lastMeeting:
            held
              .map((m) => m.heldOn)
              .toSorted()
              .at(-1) ?? null,
          meetingsInPeriod: held.filter((m) => m.heldOn >= query.from).length,
        };
      }),
      unions: unions.map((u) => ({
        name: u.name,
        isCba: u.isCba,
        checkOff: u.checkOff,
        members: counts.find((c) => c.unionId === u.id)?.n ?? 0,
      })),
    };
  }

  /** Counts only: an auditor sees that grievances are heard, never who raised them. */
  private async grievances(
    tx: Tx,
    query: AuditReportQuery,
  ): Promise<AuditReportView['grievances']> {
    const rows = await tx
      .select({
        id: grievances.id,
        category: grievances.category,
        status: grievances.status,
        createdAt: grievances.createdAt,
        locationId: grievances.locationId,
      })
      .from(grievances)
      .where(
        sql`(${grievances.createdAt} at time zone 'Asia/Dhaka')::date between ${query.from} and ${query.to}`,
      );
    const scoped = rows.filter(
      (g) => !query.locationId || !g.locationId || g.locationId === query.locationId,
    );
    const replies = scoped.length
      ? await tx
          .select({
            grievanceId: grievanceMessages.grievanceId,
            first: sql<string>`min(${grievanceMessages.createdAt})::text`,
          })
          .from(grievanceMessages)
          .where(
            and(
              inArray(
                grievanceMessages.grievanceId,
                scoped.map((g) => g.id),
              ),
              eq(grievanceMessages.author, 'staff'),
            ),
          )
          .groupBy(grievanceMessages.grievanceId)
      : [];
    const firstReply = new Map(replies.map((r) => [r.grievanceId, Date.parse(r.first)]));
    const waits = scoped
      .filter((g) => firstReply.has(g.id))
      .map((g) => (firstReply.get(g.id)! - g.createdAt.getTime()) / 86_400_000)
      .toSorted((a, b) => a - b);
    const limit = ruleOn(BD_RULES, 'grievance.decision_within_days', query.to).value;
    const now = Date.now();
    return {
      total: scoped.length,
      byCategory: countOf<GrievanceCategory>(scoped.map((g) => g.category)),
      byStatus: countOf<GrievanceStatus>(scoped.map((g) => g.status)),
      overdue: scoped.filter(
        (g) =>
          !['resolved', 'closed'].includes(g.status) &&
          (now - g.createdAt.getTime()) / 86_400_000 > limit,
      ).length,
      medianDaysToFirstReply: waits.length
        ? Math.round(waits[Math.floor(waits.length / 2)]! * 10) / 10
        : null,
    };
  }

  private async alerts(tx: Tx, ids: string[], query: AuditReportQuery) {
    const rows = await tx
      .select({
        kind: complianceAlerts.kind,
        status: complianceAlerts.status,
        employeeId: complianceAlerts.employeeId,
      })
      .from(complianceAlerts)
      // Alerts for any part of the period, such as a certificate missing since before it.
      .where(
        and(
          lte(complianceAlerts.periodStart, query.to),
          gte(complianceAlerts.periodEnd, query.from),
        ),
      );
    const scope = new Set(ids);
    const out = new Map<ComplianceAlertKind, AuditReportView['alerts'][number]>();
    for (const r of rows) {
      if (r.employeeId && !scope.has(r.employeeId)) continue;
      const row = out.get(r.kind) ?? { kind: r.kind, open: 0, acknowledged: 0, resolved: 0 };
      row[r.status] += 1;
      out.set(r.kind, row);
    }
    return [...out.values()].toSorted((a, b) => a.kind.localeCompare(b.kind));
  }
}
