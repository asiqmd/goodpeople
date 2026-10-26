import { Inject, Injectable } from '@nestjs/common';
import {
  attendanceDays,
  CIPHER_FIELDS,
  committees,
  complianceAlerts,
  employees,
  jobAssignments,
  locations,
  payrollRunItems,
  payrollRuns,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  groupBy,
  money,
  monthBounds,
  todayIn,
  type GroupDashboardQuery,
  type GroupDashboardView,
  type IsoDate,
  type PayLineView,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { componentsOf } from '../payroll/payroll-setup.service.js';
import { sealed } from '../payroll/run-context.js';
import {
  companyOn,
  dashboardFigures,
  trendMonths,
  type DashboardPerson,
  type JobStart,
  type MonthAttendance,
} from './figures.js';
import { companiesOf } from './group-policies.service.js';

/** What a month's pay cost: its runs, as the payroll cost reports count them. */
const COST_KINDS = ['regular', 'adjustment', 'bonus', 'settlement'] as const;

interface StoredItem {
  lines: PayLineView[];
  employerCost: string;
}

/**
 * The group dashboard: each company's month and the group's, for the companies the login may
 * see. Pay appears only for those who may see payroll.
 */
@Injectable()
export class GroupDashboardService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  dashboard(user: AuthUser, query: GroupDashboardQuery): Promise<GroupDashboardView> {
    return this.tenantDb.run(async (tx) => {
      const month = query.month ?? todayIn().slice(0, 7);
      const { start, end } = monthBounds(month);
      const yearStart = monthBounds(trendMonths(month)[0]!).start;
      const companies = await companiesOf(tx, user);
      const payrollVisible = userCan(user, 'payroll.view');

      // Everyone on the books at some point in the twelve months, with their jobs.
      const people = await tx
        .select({
          id: employees.id,
          gender: employees.gender,
          joinedOn: employees.joinedOn,
          separatedOn: employees.separatedOn,
        })
        .from(employees)
        .where(
          and(
            lte(employees.joinedOn, end),
            or(isNull(employees.separatedOn), gte(employees.separatedOn, yearStart)),
          ),
        );
      const jobs = await this.jobsOf(
        tx,
        people.map((p) => p.id),
      );
      const withJobs: DashboardPerson[] = people.map((p) => ({ ...p, jobs: jobs.get(p.id) ?? [] }));

      const figures = dashboardFigures({
        month,
        companies: companies.map((c) => c.id),
        people: withJobs,
        attendance: await this.attendanceIn(tx, start, end),
        alerts: await this.openAlerts(tx, end),
        pay: payrollVisible ? await this.payIn(tx, start, end) : null,
      });
      return {
        month,
        months: figures.months,
        payrollVisible,
        group: figures.group,
        companies: companies.map((c) => ({ legalEntity: c, ...figures.companies.get(c.id)! })),
      };
    });
  }

  private async jobsOf(tx: Tx, ids: string[]): Promise<Map<string, JobStart[]>> {
    if (ids.length === 0) return new Map();
    const rows = await tx
      .select({
        employeeId: jobAssignments.employeeId,
        legalEntityId: jobAssignments.legalEntityId,
        effectiveFrom: jobAssignments.effectiveFrom,
      })
      .from(jobAssignments)
      .where(inArray(jobAssignments.employeeId, ids))
      .orderBy(asc(jobAssignments.effectiveFrom));
    return groupBy(rows, (r) => r.employeeId);
  }

  /** Overtime, and absences among the working days processed so far, per person. */
  private async attendanceIn(tx: Tx, start: IsoDate, end: IsoDate) {
    const d = attendanceDays;
    const working = sql`${d.dayType} = 'working' and ${d.status} not in ('pending', 'off')`;
    const rows = await tx
      .select({
        employeeId: d.employeeId,
        overtimeMinutes: sql<number>`coalesce(sum(${d.overtimeMinutes}), 0)::int`,
        workingDays: sql<number>`(count(*) filter (where ${working}))::int`,
        absentDays: sql<number>`(count(*) filter (where ${working} and ${d.status} = 'absent'))::int`,
      })
      .from(d)
      .where(and(gte(d.date, start), lte(d.date, end)))
      .groupBy(d.employeeId);
    return new Map<string, MonthAttendance>(rows.map(({ employeeId, ...r }) => [employeeId, r]));
  }

  /**
   * Open alerts raised for periods starting by the month's end, per company: a worker's by the
   * company they worked for at the period's end, a committee's by the company it serves.
   */
  private async openAlerts(tx: Tx, end: IsoDate): Promise<Map<string, number>> {
    const a = complianceAlerts;
    const alerts = await tx
      .select({ employeeId: a.employeeId, subjectId: a.subjectId, periodEnd: a.periodEnd })
      .from(a)
      .where(and(eq(a.status, 'open'), lte(a.periodStart, end)));
    const out = new Map<string, number>();
    const add = (company: string | null | undefined) => {
      if (company) out.set(company, (out.get(company) ?? 0) + 1);
    };

    const workers = alerts.filter((x) => x.employeeId !== null);
    const jobs = await this.jobsOf(tx, [...new Set(workers.map((x) => x.employeeId!))]);
    for (const x of workers) add(companyOn(jobs.get(x.employeeId!) ?? [], x.periodEnd));

    // Committee alerts name a committee, or the company or site that has none.
    const others = [
      ...new Set(alerts.filter((x) => x.employeeId === null).map((x) => x.subjectId)),
    ];
    if (others.length) {
      const companyOf = new Map<string, string | null>([
        ...(await tx
          .select({
            id: committees.id,
            company: committees.legalEntityId,
            site: locations.legalEntityId,
          })
          .from(committees)
          .leftJoin(locations, eq(locations.id, committees.locationId))
          .where(inArray(committees.id, others))
          .then((rows) => rows.map((r) => [r.id, r.company ?? r.site] as const))),
        ...(await tx
          .select({ id: locations.id, company: locations.legalEntityId })
          .from(locations)
          .where(inArray(locations.id, others))
          .then((rows) => rows.map((r) => [r.id, r.company] as const))),
      ]);
      for (const x of alerts.filter((y) => y.employeeId === null)) {
        add(companyOf.has(x.subjectId) ? companyOf.get(x.subjectId) : x.subjectId);
      }
    }
    return out;
  }

  /**
   * Gross pay and employer cost per person from the month's runs that are computed, waiting
   * for approval or locked: what the month will cost before it is final.
   */
  private async payIn(tx: Tx, start: IsoDate, end: IsoDate) {
    const runs = await tx
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          inArray(payrollRuns.kind, [...COST_KINDS]),
          inArray(payrollRuns.status, ['computed', 'pending', 'locked']),
          gte(payrollRuns.periodStart, start),
          lte(payrollRuns.periodStart, end),
        ),
      );
    const out = new Map<string, { gross: string; employerCost: string }>();
    if (runs.length === 0) return out;
    const inGross = new Set((await componentsOf(tx)).filter((c) => c.inGross).map((c) => c.code));
    const { open } = sealed(this.cipher);
    const items = await tx
      .select({ employeeId: payrollRunItems.employeeId, resultEnc: payrollRunItems.resultEnc })
      .from(payrollRunItems)
      .where(
        and(
          inArray(
            payrollRunItems.runId,
            runs.map((r) => r.id),
          ),
          ne(payrollRunItems.status, 'error'),
        ),
      );
    for (const item of items) {
      const r = open<StoredItem>(CIPHER_FIELDS.runResults, item.resultEnc);
      const before = out.get(item.employeeId);
      const gross = r.lines
        .filter((l) => l.kind === 'earning' && inGross.has(l.code))
        .reduce((s, l) => s.plus(l.amount), new Decimal(before?.gross ?? 0));
      out.set(item.employeeId, {
        gross: money(gross),
        employerCost: money(new Decimal(before?.employerCost ?? 0).plus(r.employerCost)),
      });
    }
    return out;
  }
}
