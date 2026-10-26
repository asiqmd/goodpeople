import {
  approvalSteps,
  attendanceDays,
  donors,
  employeeAllocations,
  employees,
  jobAssignments,
  leaveRequests,
  leaveTypes,
  projects,
  timesheetEntries,
  timesheets,
  type Tx,
} from '@gp/db';
import {
  addDays,
  monthBounds,
  weekdayOf,
  type ProjectCostKind,
  type TimesheetDayView,
  type TimesheetEntryProblemCode,
  type TimesheetProjectOption,
  type TimesheetProjectRef,
  type TimesheetProjectTotal,
  type TimesheetStatus,
  type TimesheetView,
  type UserLanguage,
} from '@gp/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lte, max, min, or, sql } from 'drizzle-orm';
import { loadSteps } from '../approvals/approval-views.js';
import { employeeRef } from '../attendance/attendance-views.js';
import type { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { centi, hoursText, percentages } from './timesheet-hours.js';

export type EmployeeRow = typeof employees.$inferSelect;
export type TimesheetRow = typeof timesheets.$inferSelect;
type EntryRow = typeof timesheetEntries.$inferSelect;
type ProjectRow = typeof projects.$inferSelect & { donor: { code: string; name: string } | null };
type AllocationRow = typeof employeeAllocations.$inferSelect;

/** Entries can change while the timesheet is a draft, or rejected and being corrected. */
export const editable = (status: TimesheetStatus) => status === 'draft' || status === 'rejected';

/** '2026-10' from the stored first day of the month. */
export const monthOf = (firstDay: string) => firstDay.slice(0, 7);

/** "October 2026" and "অক্টোবর ২০২৬" for '2026-10'. */
export function monthName(month: string): Record<UserLanguage, string> {
  const first = new Date(`${month}-01T00:00:00Z`);
  const format = (locale: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      first,
    );
  return { en: format('en-GB'), bn: format('bn-BD') };
}

/** A day's cell for one project, or for work not charged to any. */
export const cellKey = (date: string, projectId: string | null) => `${date}|${projectId ?? ''}`;

export const projectRef = (p: typeof projects.$inferSelect): TimesheetProjectRef => ({
  id: p.id,
  code: p.code,
  name: p.name,
  nameBn: p.nameBn,
});

export interface PlannedShare {
  percent: string;
  costKind: ProjectCostKind;
}

/**
 * Each project's planned share for a person in a period: the latest allocation overlapping it,
 * since a share that changed mid-month is what holds from then on.
 */
export function plannedIn(
  allocations: AllocationRow[],
  from: string,
  to: string,
): Map<string, PlannedShare> {
  const out = new Map<string, PlannedShare & { fromOn: string }>();
  for (const a of allocations) {
    if (a.fromOn > to || (a.toOn !== null && a.toOn < from)) continue;
    const held = out.get(a.projectId);
    if (!held || a.fromOn > held.fromOn) {
      out.set(a.projectId, { percent: a.percent, costKind: a.costKind, fromOn: a.fromOn });
    }
  }
  return new Map([...out].map(([id, { percent, costKind }]) => [id, { percent, costKind }]));
}

/**
 * Hours by project and each one's share of the month, with the projects the person is
 * allocated to listed even when they have no hours, then the others, then uncharged work.
 */
export function totalsOf(
  sums: { projectId: string | null; hundredths: number }[],
  planned: Map<string, PlannedShare>,
  projectsById: Map<string, TimesheetProjectRef>,
): { totalHours: string; totals: TimesheetProjectTotal[] } {
  const hours = new Map<string | null, number>();
  for (const s of sums) hours.set(s.projectId, (hours.get(s.projectId) ?? 0) + s.hundredths);
  for (const id of planned.keys()) if (!hours.has(id)) hours.set(id, 0);
  const keys = [...hours.keys()].toSorted((a, b) => {
    if (a === null || b === null) return a === null ? 1 : -1;
    const allocated = Number(planned.has(b)) - Number(planned.has(a));
    return allocated || projectsById.get(a)!.code.localeCompare(projectsById.get(b)!.code);
  });
  const shares = percentages(keys.map((k) => hours.get(k)!));
  return {
    totalHours: hoursText([...hours.values()].reduce((sum, h) => sum + h, 0)),
    totals: keys.map((k, i) => ({
      project: k === null ? null : projectsById.get(k)!,
      hours: hoursText(hours.get(k)!),
      percent: shares[i]!,
      plannedPercent: k === null ? null : (planned.get(k)?.percent ?? null),
    })),
  };
}

/** Everything about one person's month that entries are checked against and shown with. */
export interface MonthContext {
  employee: EmployeeRow;
  month: string;
  start: string;
  end: string;
  /** Their company: the latest job started by the month's end. */
  companyId: string | null;
  timesheet: TimesheetRow | null;
  entries: EntryRow[];
  allocations: AllocationRow[];
  planned: Map<string, PlannedShare>;
  projects: Map<string, ProjectRow>;
  days: Omit<TimesheetDayView, 'hours'>[];
}

const selectProjects = (tx: Tx) =>
  tx
    .select({ p: projects, donor: { code: donors.code, name: donors.name } })
    .from(projects)
    .leftJoin(donors, eq(donors.id, projects.donorId));

const toProjectRow = (r: {
  p: typeof projects.$inferSelect;
  donor: { code: string | null; name: string | null } | null;
}): ProjectRow => ({
  ...r.p,
  donor: r.donor?.code ? { code: r.donor.code, name: r.donor.name! } : null,
});

/** Projects by id, whoever's they are. */
export async function projectsByIds(tx: Tx, ids: string[]): Promise<Map<string, ProjectRow>> {
  if (ids.length === 0) return new Map();
  const rows = await selectProjects(tx).where(inArray(projects.id, ids));
  return new Map(rows.map((r) => [r.p.id, toProjectRow(r)]));
}

/** Allocations of these people overlapping a period. */
export function allocationsIn(tx: Tx, employeeIds: string[], from: string, to: string) {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return tx
    .select()
    .from(employeeAllocations)
    .where(
      and(
        inArray(employeeAllocations.employeeId, employeeIds),
        lte(employeeAllocations.fromOn, to),
        or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, from)),
      ),
    );
}

export async function monthContext(
  tx: Tx,
  calendars: WorkCalendarService,
  employee: EmployeeRow,
  month: string,
): Promise<MonthContext> {
  const { start, end } = monthBounds(month);
  const [timesheet] = await tx
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.employeeId, employee.id), eq(timesheets.month, start)));
  const entries = timesheet
    ? await tx
        .select()
        .from(timesheetEntries)
        .where(eq(timesheetEntries.timesheetId, timesheet.id))
        .orderBy(asc(timesheetEntries.date), asc(timesheetEntries.createdAt))
    : [];
  const [job] = await tx
    .select({ legalEntityId: jobAssignments.legalEntityId })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.employeeId, employee.id), lte(jobAssignments.effectiveFrom, end)))
    .orderBy(desc(jobAssignments.effectiveFrom))
    .limit(1);
  const companyId = job?.legalEntityId ?? null;
  const allocations = await allocationsIn(tx, [employee.id], start, end);
  const running = companyId
    ? await selectProjects(tx).where(
        and(
          eq(projects.legalEntityId, companyId),
          eq(projects.status, 'active'),
          lte(projects.startsOn, end),
          or(isNull(projects.endsOn), gte(projects.endsOn, start)),
        ),
      )
    : [];
  const projectRows = new Map(running.map((r) => [r.p.id, toProjectRow(r)]));
  const missing = [
    ...new Set([
      ...allocations.map((a) => a.projectId),
      ...entries.flatMap((e) => (e.projectId ? [e.projectId] : [])),
    ]),
  ].filter((id) => !projectRows.has(id));
  for (const [id, row] of await projectsByIds(tx, missing)) projectRows.set(id, row);

  return {
    employee,
    month,
    start,
    end,
    companyId,
    timesheet: timesheet ?? null,
    entries,
    allocations,
    planned: plannedIn(allocations, start, end),
    projects: projectRows,
    days: await daysOf(tx, calendars, employee.id, start, end),
  };
}

/** The month's days: off days, holidays and leave, and the hours attendance recorded. */
async function daysOf(
  tx: Tx,
  calendars: WorkCalendarService,
  employeeId: string,
  start: string,
  end: string,
): Promise<MonthContext['days']> {
  const calendar = await calendars.forEmployee(tx, employeeId, start);
  const holidays = await calendars.holidaysIn(tx, calendar.calendarId, start, end);
  const recorded = await tx
    .select({
      date: attendanceDays.date,
      dayType: attendanceDays.dayType,
      workedMinutes: attendanceDays.workedMinutes,
    })
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.employeeId, employeeId),
        gte(attendanceDays.date, start),
        lte(attendanceDays.date, end),
      ),
    );
  const attendance = new Map(recorded.map((r) => [r.date, r]));
  const leave = await tx
    .select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      halfDay: leaveRequests.halfDay,
      code: leaveTypes.code,
      name: leaveTypes.name,
      nameBn: leaveTypes.nameBn,
      countsOffDays: leaveTypes.countsOffDays,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, start),
      ),
    );

  const days: MonthContext['days'] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const weekend = calendar.weeklyOffDays.includes(weekdayOf(date));
    const holiday = holidays.get(date) ?? null;
    const recordedDay = attendance.get(date);
    // Processed attendance knows the roster; otherwise the calendar is all there is.
    const offDay = recordedDay ? recordedDay.dayType !== 'working' : weekend || holiday !== null;
    const onLeave = leave.find(
      (l) =>
        l.startDate <= date && l.endDate >= date && (l.countsOffDays || (!weekend && !holiday)),
    );
    const workedMinutes = recordedDay?.workedMinutes ?? 0;
    days.push({
      date,
      weekend,
      holiday,
      leave: onLeave
        ? {
            code: onLeave.code,
            name: onLeave.name,
            nameBn: onLeave.nameBn,
            days: onLeave.halfDay ? 0.5 : 1,
          }
        : null,
      offDay,
      workedHours: workedMinutes > 0 ? hoursText(Math.round((workedMinutes * 100) / 60)) : null,
    });
  }
  return days;
}

/**
 * Why hours cannot be charged to a project on a date, or null when they can: it must be
 * active and running then, and their company's or allocated to them.
 */
export function chargeProblem(
  ctx: Pick<MonthContext, 'companyId' | 'allocations'>,
  project: ProjectRow | undefined,
  date: string,
): TimesheetEntryProblemCode | null {
  if (!project) return 'project_unknown';
  if (project.status !== 'active') return 'project_inactive';
  const allocated = ctx.allocations.some((a) => a.projectId === project.id);
  if (project.legalEntityId !== ctx.companyId && !allocated) return 'project_other_company';
  if (project.startsOn > date || (project.endsOn !== null && project.endsOn < date)) {
    return 'project_outside_period';
  }
  return null;
}

/** The person's allocated projects first, then the rest, each by code. */
function optionsOf(ctx: MonthContext): TimesheetProjectOption[] {
  return [...ctx.projects.values()]
    .map((p) => {
      const planned = ctx.planned.get(p.id);
      const runsInMonth = p.startsOn <= ctx.end && (p.endsOn === null || p.endsOn >= ctx.start);
      return {
        ...projectRef(p),
        donor: p.donor,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        plannedPercent: planned?.percent ?? null,
        costKind: planned?.costKind ?? null,
        chargeable:
          p.status === 'active' &&
          runsInMonth &&
          (p.legalEntityId === ctx.companyId || planned !== undefined),
      };
    })
    .toSorted(
      (a, b) =>
        Number(b.plannedPercent !== null) - Number(a.plannedPercent !== null) ||
        a.code.localeCompare(b.code),
    );
}

/** The steps since the timesheet was last submitted; earlier rounds sit below zero. */
async function currentSteps(tx: Tx, timesheetId: string) {
  const steps = (await loadSteps(tx, 'timesheet', [timesheetId])).get(timesheetId) ?? [];
  return steps.filter((s) => s.stepNo > 0);
}

/**
 * Before a resubmission builds its steps from 1 again, moves the earlier round's below every
 * step number used so far, keeping its decisions on record.
 */
export async function retireSteps(tx: Tx, timesheetId: string) {
  const [range] = await tx
    .select({ low: min(approvalSteps.stepNo), high: max(approvalSteps.stepNo) })
    .from(approvalSteps)
    .where(eq(approvalSteps.subjectId, timesheetId));
  if (!range?.high || range.high <= 0) return;
  await tx
    .update(approvalSteps)
    .set({ stepNo: sql`${approvalSteps.stepNo} + ${range.low! - 1 - range.high}` })
    .where(and(eq(approvalSteps.subjectId, timesheetId), gte(approvalSteps.stepNo, 1)));
}

export async function viewOf(tx: Tx, ctx: MonthContext): Promise<TimesheetView> {
  const sheet = ctx.timesheet;
  const byDay = new Map<string, number>();
  for (const e of ctx.entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + centi(e.hours));
  const refs = new Map([...ctx.projects].map(([id, p]) => [id, projectRef(p)]));
  const [decider] = sheet?.decidedByEmployeeId
    ? await tx
        .select({ id: employees.id, fullName: employees.fullName })
        .from(employees)
        .where(eq(employees.id, sheet.decidedByEmployeeId))
    : [];
  const status = sheet?.status ?? 'draft';
  return {
    id: sheet?.id ?? null,
    employee: employeeRef(ctx.employee),
    month: ctx.month,
    from: ctx.start,
    to: ctx.end,
    status,
    needed: ctx.planned.size > 0,
    editable: editable(status),
    submittedAt: sheet?.submittedAt?.toISOString() ?? null,
    decidedAt: sheet?.decidedAt?.toISOString() ?? null,
    decidedBy: decider ?? null,
    note: sheet?.note ?? null,
    projects: optionsOf(ctx),
    days: ctx.days.map((day) => ({ ...day, hours: hoursText(byDay.get(day.date) ?? 0) })),
    entries: ctx.entries.map((e) => ({
      id: e.id,
      date: e.date,
      projectId: e.projectId,
      hours: e.hours,
      note: e.note,
    })),
    ...totalsOf(
      ctx.entries.map((e) => ({ projectId: e.projectId, hundredths: centi(e.hours) })),
      ctx.planned,
      refs,
    ),
    steps: sheet ? await currentSteps(tx, sheet.id) : [],
  };
}
