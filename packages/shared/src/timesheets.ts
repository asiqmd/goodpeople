import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import type { ApprovalStepKind } from './leave.js';
import type { ApprovalStepView } from './leave-types.js';
import type { ProjectCostKind, TimesheetStatus } from './projects.js';

// Monthly project timesheets (Phase 3 M4, the NGO pack): the hours each person worked on each
// project, certified by them and approved by their manager. An approved timesheet is the basis
// of the month's salary split across projects; without one the planned allocation stands.
// Statuses are in projects.ts.

/** A day holds at most 24 hours, whatever they are charged to. */
export const MAX_DAY_HOURS = 24;
/** The most entries one save may hold: a month of days across many projects. */
export const MAX_TIMESHEET_BATCH = 1000;

/** Why an entry was not saved; the others in the same save are. */
export const TIMESHEET_ENTRY_PROBLEMS = [
  'date_outside_month',
  'project_unknown',
  'project_inactive',
  'project_other_company',
  'project_outside_period',
  'day_over_24_hours',
  'client_id_taken',
] as const;
export type TimesheetEntryProblemCode = (typeof TIMESHEET_ENTRY_PROBLEMS)[number];

/** What the employee certifies on submitting, shown wherever a timesheet is signed or printed. */
export const TIMESHEET_DECLARATION = {
  en: 'I certify that the hours in this timesheet are the work I actually did in this month, on the projects shown.',
  bn: 'আমি প্রত্যয়ন করছি যে এই টাইমশিটে উল্লিখিত ঘণ্টাগুলো এ মাসে প্রদর্শিত প্রকল্পগুলোতে আমার প্রকৃতপক্ষে সম্পাদিত কাজের সময়।',
} as const;

export const timesheetMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');

/** Hours on a day, as a number or text, to two decimals; empty means none. */
export const timesheetHoursSchema = z
  .union([z.number(), z.string().trim(), z.null()])
  .transform((v) => (v === null || v === '' ? 0 : Number(v)))
  .pipe(
    z
      .number({ error: 'Enter hours like 7.5' })
      .min(0, 'Enter zero or more hours')
      .max(MAX_DAY_HOURS, `At most ${MAX_DAY_HOURS} hours a day`)
      .refine((v) => Math.round(v * 100) / 100 === v, 'Enter hours to two decimals at most'),
  );

export const timesheetEntryInputSchema = z.object({
  /** Chosen by the app for an entry made offline: sending it again changes nothing. */
  clientId: z.uuid().optional(),
  date: z.iso.date(),
  /** null: work not charged to any project. */
  projectId: z.uuid().nullable().default(null),
  /** Zero removes the entry. */
  hours: timesheetHoursSchema,
  note: z.string().trim().max(500).nullable().optional(),
});
export type TimesheetEntryInput = z.infer<typeof timesheetEntryInputSchema>;

/** Entries for the signed-in employee's month, saved in order; the last one for a cell wins. */
export const timesheetEntriesSchema = z.object({
  month: timesheetMonthSchema,
  entries: z.array(timesheetEntryInputSchema).min(1).max(MAX_TIMESHEET_BATCH),
});
export type TimesheetEntriesInput = z.infer<typeof timesheetEntriesSchema>;

export const timesheetMonthQuerySchema = z.object({ month: timesheetMonthSchema });
export type TimesheetMonthQuery = z.infer<typeof timesheetMonthQuerySchema>;

export const timesheetSubmitSchema = z.object({
  month: timesheetMonthSchema,
  declaration: z.literal(true, { error: 'Confirm the declaration to submit' }),
});
export type TimesheetSubmitInput = z.infer<typeof timesheetSubmitSchema>;

export const timesheetReopenSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type TimesheetReopenInput = z.infer<typeof timesheetReopenSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

export interface TimesheetProjectRef {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
}

/** A project shown on a timesheet: the person's allocated ones first. */
export interface TimesheetProjectOption extends TimesheetProjectRef {
  donor: { code: string; name: string } | null;
  startsOn: string;
  endsOn: string | null;
  /** Their planned share of salary on it in the month; null when not allocated. */
  plannedPercent: string | null;
  costKind: ProjectCostKind | null;
  /**
   * Hours can be added: the project is active, runs in the month, and is their company's or
   * allocated to them. A closed project with hours already stays on the sheet without it.
   */
  chargeable: boolean;
}

export interface TimesheetDayView {
  date: string;
  /** A weekly holiday of their work location. */
  weekend: boolean;
  /** The public or festival holiday's name. */
  holiday: string | null;
  /** Approved leave on the day. */
  leave: { code: string; name: string; nameBn: string | null; days: number } | null;
  /** Not a working day for them: a weekend, a holiday or a rostered day off. */
  offDay: boolean;
  /** Hours attendance recorded, a hint for what to enter; null when it recorded none. */
  workedHours: string | null;
  /** The day's entries together. */
  hours: string;
}

export interface TimesheetEntryView {
  id: string;
  date: string;
  /** null: work not charged to a project. */
  projectId: string | null;
  hours: string;
  note: string | null;
}

export interface TimesheetProjectTotal {
  /** null: work not charged to a project. */
  project: TimesheetProjectRef | null;
  hours: string;
  /** Share of the month's hours, to two decimals. */
  percent: string;
  /** Their planned share of salary on it, to compare; null when not allocated. */
  plannedPercent: string | null;
}

/** A month's timesheet in a line, for the approvals inbox. */
export interface TimesheetSummary {
  id: string;
  employee: EmployeeRef;
  /** YYYY-MM. */
  month: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  totalHours: string;
  totals: TimesheetProjectTotal[];
}

/** One person's month. Before anything is saved it is an empty draft with no id. */
export interface TimesheetView extends Omit<TimesheetSummary, 'id'> {
  id: string | null;
  from: string;
  to: string;
  /** They have an allocation overlapping the month, so a timesheet is expected. */
  needed: boolean;
  /** Entries can change: a draft, or a rejected timesheet to correct and submit again. */
  editable: boolean;
  decidedBy: { id: string; fullName: string } | null;
  /** Why HR reopened it, if it was. */
  note: string | null;
  projects: TimesheetProjectOption[];
  days: TimesheetDayView[];
  entries: TimesheetEntryView[];
  /** The current round of approval: the steps since it was last submitted. */
  steps: ApprovalStepView[];
}

export interface TimesheetEntryOutcome {
  clientId: string | null;
  date: string;
  projectId: string | null;
  hours: string;
  /** duplicate: an entry sent before with the same client id, left as it is. */
  outcome: 'saved' | 'removed' | 'duplicate';
}

export interface TimesheetEntryRefusal {
  clientId: string | null;
  date: string;
  projectId: string | null;
  hours: string;
  code: TimesheetEntryProblemCode;
  message: string;
}

export interface TimesheetEntriesResult {
  accepted: TimesheetEntryOutcome[];
  refused: TimesheetEntryRefusal[];
  timesheet: TimesheetView;
}

export interface TimesheetPrefillResult {
  /** Days filled from attendance. */
  days: number;
  timesheet: TimesheetView;
}

export interface TimesheetListRow extends Omit<TimesheetSummary, 'id' | 'status'> {
  /** null when the person has not started one. */
  id: string | null;
  status: TimesheetStatus | null;
  needed: boolean;
}

/** Everyone who needs a timesheet for the month or has one. */
export interface TimesheetListView {
  month: string;
  /** Every project with hours in the month, for the columns. */
  projects: TimesheetProjectRef[];
  rows: TimesheetListRow[];
}

export interface TimesheetApprovalItem {
  subjectType: 'timesheet';
  stepId: string;
  kind: ApprovalStepKind;
  timesheet: TimesheetSummary;
}
