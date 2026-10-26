import { Inject, Injectable } from '@nestjs/common';
import { BD_FOREIGN_DONATIONS, bdForeignDonationsOn } from '@gp/country-packs';
import {
  CIPHER_FIELDS,
  employeeAllocations,
  employees,
  legalEntities,
  payrollRunItems,
  payrollRuns,
  timesheetEntries,
  timesheets,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  formatAddress,
  money,
  monthBounds,
  type AllocationBasis,
  type DonorReportQuery,
  type ProjectCostKind,
  type ProjectCostMonth,
  type ProjectCostReport,
  type ProjectCostTotals,
  type ProjectPeriodQuery,
  type ProjectTimesheetRef,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { PdfService } from '../letters/pdf.service.js';
import { partsOf } from '../payroll/reports-pdf.js';
import { jobsOn, sealed } from '../payroll/run-context.js';
import { scheduleCsv, scheduleHtml, type ScheduleRow } from './donor-report.js';
import { ProjectSharesService } from './project-shares.service.js';
import { projectOf } from './projects.queries.js';
import { monthsFrom, splitAmount } from './shares.js';

/** The runs a month's pay cost comes from, as in payroll's cost summary. */
const COST_KINDS = ['regular', 'adjustment', 'bonus', 'settlement'] as const;

/** A person's month of locked pay, the part charged to one project. */
interface Charge {
  employeeId: string;
  month: string;
  projectId: string;
  costKind: ProjectCostKind;
  basis: AllocationBasis;
  fraction: Decimal;
  hours: Decimal | null;
  earnings: Decimal;
  employerCost: Decimal;
}

const sum = (values: Decimal[]) => values.reduce((s, v) => s.plus(v), new Decimal(0));
const percentOf = (part: Decimal, whole: string) =>
  part.dividedBy(whole).times(100).toDecimalPlaces(2).toNumber();

function totalsOf(charges: Charge[]): ProjectCostTotals {
  const cost = (c: Charge) => c.earnings.plus(c.employerCost);
  return {
    earnings: money(sum(charges.map((c) => c.earnings))),
    employerCost: money(sum(charges.map((c) => c.employerCost))),
    total: money(sum(charges.map(cost))),
    programme: money(sum(charges.filter((c) => c.costKind === 'programme').map(cost))),
    admin: money(sum(charges.filter((c) => c.costKind === 'admin').map(cost))),
  };
}

/**
 * What projects were charged in salaries: locked payroll split by each person's shares, by
 * month, against the staff budget and the Act's cap on administration, and the personnel cost
 * schedule donors ask for.
 */
@Injectable()
export class ProjectCostsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly shares: ProjectSharesService,
    private readonly pdf: PdfService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Each project's salaries charged in a month (YYYY-MM). */
  async monthTotals(tx: Tx, month: string): Promise<Map<string, string>> {
    const { charges } = await this.charges(tx, month, month, null);
    const out = new Map<string, Decimal>();
    for (const c of charges) {
      out.set(
        c.projectId,
        (out.get(c.projectId) ?? new Decimal(0)).plus(c.earnings).plus(c.employerCost),
      );
    }
    return new Map([...out].map(([id, total]) => [id, money(total)]));
  }

  /** A project's months in a period, and everything charged since it started. */
  report(id: string, query: ProjectPeriodQuery): Promise<ProjectCostReport> {
    return this.tenantDb.run(async (tx) => {
      const project = await projectOf(tx, id);
      const started = project.startsOn.slice(0, 7);
      const { charges, unlocked } = await this.charges(
        tx,
        started < query.from ? started : query.from,
        query.to,
        [id],
      );
      const months: ProjectCostMonth[] = monthsFrom(query.from, query.to).map((month) => {
        const mine = charges.filter((c) => c.month === month);
        const basisOf = new Map(mine.map((c) => [c.employeeId, c.basis]));
        return {
          month,
          people: basisOf.size,
          fte: sum(mine.map((c) => c.fraction)).toFixed(2),
          ...totalsOf(mine),
          basis: {
            timesheet: [...basisOf.values()].filter((b) => b === 'timesheet').length,
            planned: [...basisOf.values()].filter((b) => b === 'planned').length,
          },
          unlocked: unlocked.has(month),
        };
      });
      const cumulative = totalsOf(charges.filter((c) => c.month >= started));
      const spent = new Decimal(cumulative.total);
      const end = monthBounds(query.to).end;
      // The Act came into force on 13 Oct 2016; before it there is no cap to show.
      const rules = BD_FOREIGN_DONATIONS[0]!.from <= end ? bdForeignDonationsOn(end) : null;
      const admin = new Decimal(cumulative.admin);
      const cap =
        project.approvedBudget && rules
          ? new Decimal(project.approvedBudget).times(rules.adminCapPercent).dividedBy(100)
          : null;
      return {
        project,
        from: query.from,
        to: query.to,
        months,
        total: totalsOf(charges.filter((c) => c.month >= query.from && c.month <= query.to)),
        cumulative: {
          ...cumulative,
          staffBudget: project.staffBudget,
          staffBudgetUsed:
            project.staffBudget && Number(project.staffBudget) > 0
              ? percentOf(spent, project.staffBudget)
              : null,
          overStaffBudget: !!project.staffBudget && spent.greaterThan(project.staffBudget),
        },
        adminCap:
          cap && rules && project.approvedBudget
            ? {
                reference: rules.adminCapReference,
                status: rules.status,
                percent: rules.adminCapPercent,
                approvedBudget: project.approvedBudget,
                cap: money(cap),
                admin: money(admin),
                used:
                  Number(project.approvedBudget) > 0 ? percentOf(admin, project.approvedBudget) : 0,
                over: admin.greaterThan(cap),
              }
            : null,
      };
    });
  }

  /** Approved timesheets in the period of the people on the project, for the donor's file. */
  timesheets(id: string, query: ProjectPeriodQuery): Promise<ProjectTimesheetRef[]> {
    return this.tenantDb.run(async (tx) => {
      await projectOf(tx, id);
      const start = `${query.from}-01`;
      const end = monthBounds(query.to).end;
      const people = await this.peopleOf(tx, start, end, [id]);
      if (people.length === 0) return [];
      const rows = await tx
        .select({
          sheet: timesheets,
          employee: employees,
          hours: sql<string>`coalesce(sum(${timesheetEntries.hours}), 0)::text`,
          projectHours: sql<string>`coalesce(sum(${timesheetEntries.hours}) filter (where ${timesheetEntries.projectId} = ${id}), 0)::text`,
        })
        .from(timesheets)
        .innerJoin(employees, eq(employees.id, timesheets.employeeId))
        .leftJoin(timesheetEntries, eq(timesheetEntries.timesheetId, timesheets.id))
        .where(
          and(
            inArray(timesheets.employeeId, people),
            eq(timesheets.status, 'approved'),
            gte(timesheets.month, start),
            lte(timesheets.month, end),
          ),
        )
        .groupBy(timesheets.id, employees.id)
        .orderBy(asc(timesheets.month), asc(employees.employeeCode));
      return rows.map((r) => ({
        id: r.sheet.id,
        employee: employeeRef(r.employee),
        month: r.sheet.month.slice(0, 7),
        hours: new Decimal(r.hours).toFixed(2),
        projectHours: new Decimal(r.projectHours).toFixed(2),
        decidedAt: r.sheet.decidedAt?.toISOString() ?? null,
      }));
    });
  }

  /**
   * The personnel cost schedule: a row per person and month charged to the project, as CSV,
   * or as a PDF headed with the grant and its FD-6 approval, for the finance signatory.
   */
  async donorReport(id: string, query: DonorReportQuery) {
    const bn = query.language === 'bn';
    const data = await this.tenantDb.run(async (tx) => {
      const project = await projectOf(tx, id);
      const { charges } = await this.charges(tx, query.from, query.to, [id]);
      const byPersonMonth = new Map<string, Charge[]>();
      for (const c of charges) {
        const key = `${c.employeeId}|${c.month}`;
        byPersonMonth.set(key, [...(byPersonMonth.get(key) ?? []), c]);
      }
      const ids = [...new Set(charges.map((c) => c.employeeId))];
      const people = new Map(
        (ids.length ? await tx.select().from(employees).where(inArray(employees.id, ids)) : []).map(
          (e) => [e.id, e],
        ),
      );
      const jobs = new Map<string, Awaited<ReturnType<typeof jobsOn>>>();
      for (const month of new Set(charges.map((c) => c.month))) {
        const inMonth = charges.filter((c) => c.month === month).map((c) => c.employeeId);
        jobs.set(month, await jobsOn(tx, inMonth, monthBounds(month).end));
      }
      const rows: ScheduleRow[] = [...byPersonMonth.values()]
        .map((parts) => {
          const { employeeId, month, basis } = parts[0]!;
          const person = people.get(employeeId)!;
          const job = jobs.get(month)?.get(employeeId);
          const earnings = sum(parts.map((c) => c.earnings));
          const employerCost = sum(parts.map((c) => c.employerCost));
          const hours = parts.some((c) => c.hours)
            ? sum(parts.map((c) => c.hours ?? new Decimal(0)))
            : null;
          return {
            code: person.employeeCode,
            name: bn && person.fullNameBn ? person.fullNameBn : person.fullName,
            designation: (bn ? job?.designationBn : null) ?? job?.designation ?? null,
            month,
            basis,
            share: sum(parts.map((c) => c.fraction))
              .times(100)
              .toFixed(2),
            hours: hours ? hours.toFixed(2) : null,
            earnings: money(earnings),
            employerCost: money(employerCost),
            total: money(earnings.plus(employerCost)),
          };
        })
        .toSorted((a, b) => a.code.localeCompare(b.code) || a.month.localeCompare(b.month));
      const [entity] = await tx
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.id, project.legalEntity.id));
      return { project, rows, totals: totalsOf(charges), entity };
    });
    const { project, rows, totals, entity } = data;
    const fileName = `personnel-costs-${project.code}-${query.from}-to-${query.to}`;
    if (query.format === 'csv') {
      return {
        bytes: Buffer.from(scheduleCsv(rows)),
        contentType: 'text/csv; charset=utf-8',
        fileName: `${fileName}.csv`,
      };
    }
    const doc = {
      language: query.language,
      company: {
        name: entity?.legalName ?? entity?.name ?? '',
        details: [
          entity?.address ? formatAddress(entity.address, query.language) : null,
          entity?.tin ? `TIN ${entity.tin}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      project: { code: project.code, name: bn && project.nameBn ? project.nameBn : project.name },
      donor: project.donor?.name ?? null,
      grantReference: project.grantReference,
      fd6ApprovalNo: project.fd6ApprovalNo,
      fd6ApprovedOn: project.fd6ApprovedOn,
      from: query.from,
      to: query.to,
      rows,
      totals,
    };
    return {
      bytes: await this.pdf.renderParts(
        partsOf(rows.length).map((part) => scheduleHtml(doc, part)),
      ),
      contentType: 'application/pdf',
      fileName: `${fileName}-${query.language}.pdf`,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** People with a planned share in the projects, or hours on them in an approved timesheet. */
  private async peopleOf(
    tx: Tx,
    start: string,
    end: string,
    projectIds: string[] | null,
  ): Promise<string[]> {
    const planned = await tx
      .selectDistinct({ id: employeeAllocations.employeeId })
      .from(employeeAllocations)
      .where(
        and(
          projectIds ? inArray(employeeAllocations.projectId, projectIds) : undefined,
          lte(employeeAllocations.fromOn, end),
          or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, start)),
        ),
      );
    const logged = await tx
      .selectDistinct({ id: timesheets.employeeId })
      .from(timesheets)
      .innerJoin(timesheetEntries, eq(timesheetEntries.timesheetId, timesheets.id))
      .where(
        and(
          eq(timesheets.status, 'approved'),
          gte(timesheets.month, start),
          lte(timesheets.month, end),
          projectIds
            ? inArray(timesheetEntries.projectId, projectIds)
            : isNotNull(timesheetEntries.projectId),
        ),
      );
    return [...new Set([...planned, ...logged].map((r) => r.id))];
  }

  /**
   * Locked pay of each month (as payroll's cost summary counts it) split by each person's
   * shares, keeping the parts for the projects asked for (all when null). Months with a run
   * not locked yet for these people are noted: their pay is not counted.
   */
  private async charges(tx: Tx, from: string, to: string, projectIds: string[] | null) {
    const start = `${from}-01`;
    const end = monthBounds(to).end;
    const unlocked = new Set<string>();
    const charges: Charge[] = [];
    const people = await this.peopleOf(tx, start, end, projectIds);
    if (people.length === 0) return { charges, unlocked };
    const runs = await tx
      .select({
        id: payrollRuns.id,
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
      })
      .from(payrollRuns)
      .where(
        and(
          inArray(payrollRuns.kind, [...COST_KINDS]),
          gte(payrollRuns.periodStart, start),
          lte(payrollRuns.periodStart, end),
          ne(payrollRuns.status, 'cancelled'),
        ),
      );
    // A draft has no one in it yet, so it may be anyone's.
    for (const r of runs) if (r.status === 'draft') unlocked.add(r.periodStart.slice(0, 7));
    const items = runs.length
      ? await tx
          .select({
            runId: payrollRunItems.runId,
            employeeId: payrollRunItems.employeeId,
            status: payrollRunItems.status,
            resultEnc: payrollRunItems.resultEnc,
          })
          .from(payrollRunItems)
          .where(
            and(
              inArray(
                payrollRunItems.runId,
                runs.map((r) => r.id),
              ),
              inArray(payrollRunItems.employeeId, people),
            ),
          )
      : [];
    const runOf = new Map(runs.map((r) => [r.id, r]));
    const { open } = sealed(this.cipher);
    const pay = new Map<
      string,
      { employeeId: string; month: string; earnings: Decimal; employerCost: Decimal }
    >();
    for (const item of items) {
      const run = runOf.get(item.runId)!;
      const month = run.periodStart.slice(0, 7);
      if (run.status !== 'locked') {
        unlocked.add(month);
        continue;
      }
      if (item.status === 'error') continue;
      const result = open<{ earnings: string; employerCost: string }>(
        CIPHER_FIELDS.runResults,
        item.resultEnc,
      );
      const key = `${item.employeeId}|${month}`;
      const p = pay.get(key) ?? {
        employeeId: item.employeeId,
        month,
        earnings: new Decimal(0),
        employerCost: new Decimal(0),
      };
      p.earnings = p.earnings.plus(result.earnings);
      p.employerCost = p.employerCost.plus(result.employerCost);
      pay.set(key, p);
    }
    if (pay.size === 0) return { charges, unlocked };
    const shares = await this.shares.sharesByMonth(
      tx,
      [...pay.values()].map((p) => p.employeeId),
      from,
      to,
    );
    for (const p of pay.values()) {
      const split = shares.get(p.month)?.get(p.employeeId);
      if (!split?.shares.length) continue;
      // Split across all the person's projects, so each part rounds as in the cost summary.
      const fractions = split.shares.map((s) => s.fraction);
      const earnings = splitAmount(p.earnings, fractions).parts;
      const employerCost = splitAmount(p.employerCost, fractions).parts;
      split.shares.forEach((s, i) => {
        if (projectIds && !projectIds.includes(s.projectId)) return;
        charges.push({
          employeeId: p.employeeId,
          month: p.month,
          projectId: s.projectId,
          costKind: s.costKind,
          basis: split.basis,
          fraction: s.fraction,
          hours: s.hours,
          earnings: earnings[i]!,
          employerCost: employerCost[i]!,
        });
      });
    }
    return { charges, unlocked };
  }
}
