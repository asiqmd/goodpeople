import {
  attendanceDays,
  attendanceSettings,
  jobAssignments,
  learningEnrolments,
  learningSessions,
  leaveLedger,
  leaveRequests,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  INSIGHT_MAX_ROWS,
  INSIGHT_MIN_COHORT,
  type InsightDefinition,
  type InsightPoint,
} from '@gp/shared';
import { and, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import { badRequest } from '../../common/errors.js';

type Definition = Exclude<InsightDefinition, { kind: 'payroll' }>;
type Window = { from: string; through: string; timeZone: string; country: string };

function assignmentAt(tx: Tx, employee: SQL, day: SQL, companyId: string) {
  const active = sql`(${jobAssignments.effectiveTo} is null or ${jobAssignments.effectiveTo} >= ${day})`;
  const company = sql`${jobAssignments.legalEntityId} = ${companyId}::uuid`;
  return tx
    .select({
      count: sql<number>`count(*) filter (where ${active})::int`.as('assignment_count'),
      activeCompany: sql<boolean>`bool_or(${company} and ${active})`.as('active_company'),
      pastCompany: sql<boolean>`bool_or(${company})`.as('past_company'),
    })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.employeeId, employee), lte(jobAssignments.effectiveFrom, day)))
    .as('assignment_coverage');
}

function companyCandidate(job: ReturnType<typeof assignmentAt>) {
  // A missing active assignment can affect a previously associated company. An active
  // assignment elsewhere excludes its former company. Count overlaps across all companies.
  return sql`(${job.activeCompany} or (${job.count} = 0 and ${job.pastCompany}))`;
}

function withinLimit(rows: unknown[]) {
  if (rows.length > INSIGHT_MAX_ROWS)
    throw badRequest('insight_limit', 'This company-month exceeds the reporting row limit');
}

const small = (size: number) => size > 0 && size < INSIGHT_MIN_COHORT;

export async function operatingInsight(
  tx: Tx,
  definition: Definition,
  window: Window,
): Promise<InsightPoint> {
  const { from, through, timeZone, country } = window;
  const point: InsightPoint = {
    month: definition.month,
    country,
    currency: null,
    state: 'recorded',
    values: {},
  };
  const incomplete: InsightPoint = { ...point, state: 'incomplete', issue: 'coverage' };
  const suppressed: InsightPoint = { ...point, state: 'suppressed', issue: 'cohort' };
  const { companyId } = definition;
  if (definition.kind === 'attendance') {
    const [settings] = await tx
      .select({
        from: attendanceSettings.trackingFrom,
        through: attendanceSettings.processedThrough,
      })
      .from(attendanceSettings);
    if (!settings?.through || settings.from > from || settings.through < through) return incomplete;
    const job = assignmentAt(
      tx,
      sql`${attendanceDays.employeeId}`,
      sql`${attendanceDays.date}`,
      companyId,
    );
    const rows = await tx
      .select({
        employee: attendanceDays.employeeId,
        minutes: attendanceDays.workedMinutes,
        status: attendanceDays.status,
        assignments: job.count,
      })
      .from(attendanceDays)
      .innerJoinLateral(job, sql`true`)
      .where(
        and(
          gte(attendanceDays.date, from),
          lte(attendanceDays.date, through),
          companyCandidate(job),
        ),
      )
      .limit(INSIGHT_MAX_ROWS + 1);
    withinLimit(rows);
    if (rows.some((r) => r.assignments !== 1)) return incomplete;
    const worked = rows.filter(
      (r) => r.minutes > 0 && r.status !== 'pending' && r.status !== 'missing_punch',
    );
    if (small(new Set(worked.map((r) => r.employee)).size)) return suppressed;
    return {
      ...point,
      state: rows.some((r) => r.status === 'pending' || r.status === 'missing_punch')
        ? 'provisional'
        : 'recorded',
      values: {
        worked_days: String(worked.length),
        worked_minutes: String(worked.reduce((sum, r) => sum + r.minutes, 0)),
      },
    };
  }
  if (definition.kind === 'leave') {
    const job = assignmentAt(
      tx,
      sql`${leaveLedger.employeeId}`,
      sql`${leaveRequests.startDate}`,
      companyId,
    );
    const postingDay = sql`timezone(${timeZone}, ${leaveLedger.createdAt})::date`;
    const rows = await tx
      .select({
        employee: leaveLedger.employeeId,
        days: leaveLedger.days,
        assignments: job.count,
      })
      .from(leaveLedger)
      .innerJoin(
        leaveRequests,
        and(
          eq(leaveRequests.id, leaveLedger.requestId),
          eq(leaveRequests.employeeId, leaveLedger.employeeId),
        ),
      )
      .innerJoinLateral(job, sql`true`)
      .where(
        and(
          inArray(leaveLedger.kind, ['taken', 'reversal', 'recalculation']),
          sql`${postingDay} between ${from}::date and ${through}::date`,
          companyCandidate(job),
        ),
      )
      .limit(INSIGHT_MAX_ROWS + 1);
    withinLimit(rows);
    if (rows.some((r) => r.assignments !== 1)) return incomplete;
    const net = new Map<string, Decimal>();
    for (const row of rows)
      net.set(row.employee, (net.get(row.employee) ?? new Decimal(0)).minus(row.days));
    if (
      rows.length &&
      [...net.values()].filter((days) => !days.isZero()).length < INSIGHT_MIN_COHORT
    )
      return suppressed;
    return {
      ...point,
      values: {
        net_leave_days: [...net.values()]
          .reduce((sum, days) => sum.plus(days), new Decimal(0))
          .toFixed(1),
      },
    };
  }
  const sessionDay = sql`timezone(${timeZone}, ${learningSessions.startsAt})::date`;
  const rows = await tx
    .select({
      employee: learningEnrolments.employeeId,
      status: learningEnrolments.status,
      session: learningSessions.status,
    })
    .from(learningEnrolments)
    .innerJoin(learningSessions, eq(learningEnrolments.sessionId, learningSessions.id))
    .where(
      and(
        eq(learningSessions.legalEntityId, companyId),
        ne(learningSessions.status, 'cancelled'),
        ne(learningEnrolments.status, 'cancelled'),
        sql`${sessionDay} between ${from}::date and ${through}::date`,
      ),
    )
    .limit(INSIGHT_MAX_ROWS + 1);
  withinLimit(rows);
  const completed = rows.filter((r) => r.status === 'attended' && r.session === 'completed');
  const outstanding = rows.filter((r) => r.status !== 'attended' || r.session !== 'completed');
  if (
    [rows, completed, outstanding].some((cohort) =>
      small(new Set(cohort.map((r) => r.employee)).size),
    )
  )
    return suppressed;
  return {
    ...point,
    state: rows.some((r) => r.session === 'planned' || r.status === 'enrolled')
      ? 'provisional'
      : 'recorded',
    values: { assigned: String(rows.length), completed: String(completed.length) },
  };
}
