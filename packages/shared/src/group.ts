import { z } from 'zod';
import { SELF_PUNCH_MODES, type SelfPunchMode } from './attendance.js';
import type { LeaveAccrual, StatutoryLeave } from './leave.js';

// Groups of companies (Phase 3 M4, the group pack): figures across companies, group policy
// that a company may override, and HR roles for shared services limited to some companies.

/** Policies a company may override: each has a typed set of values (see the schemas). */
export const POLICY_AREAS = [
  'leave_type',
  'attendance',
  'provident_fund',
  'overtime_caps',
] as const;
export type PolicyArea = (typeof POLICY_AREAS)[number];

// ── Policy overrides ─────────────────────────────────────────────────────────

/**
 * The values each area holds: the group's (what the workspace sets today: a leave type's own
 * columns, attendance, payroll and compliance settings) and, once a company's override is
 * applied, that company's. The names are the group's own column names.
 */
export interface PolicyValues {
  leave_type: {
    daysPerYear: number | null;
    carryForwardMax: number;
    /** null: no limit on one request. */
    maxDaysPerRequest: number | null;
  };
  attendance: { selfPunch: SelfPunchMode; requireSelfie: boolean };
  provident_fund: { pfEmployeeRate: string; pfEmployerRate: string };
  overtime_caps: {
    overtimeDailyCapMinutes: number;
    overtimeWeeklyCapMinutes: number;
    /** null: no monthly cap. */
    overtimeMonthlyCapMinutes: number | null;
  };
}
export type PolicyOverride<A extends PolicyArea> = Partial<PolicyValues[A]>;

/** Each area's fields, in the order pages show them. */
export const POLICY_FIELDS = {
  leave_type: ['daysPerYear', 'carryForwardMax', 'maxDaysPerRequest'],
  attendance: ['selfPunch', 'requireSelfie'],
  provident_fund: ['pfEmployeeRate', 'pfEmployerRate'],
  overtime_caps: [
    'overtimeDailyCapMinutes',
    'overtimeWeeklyCapMinutes',
    'overtimeMonthlyCapMinutes',
  ],
} as const satisfies { [A in PolicyArea]: readonly (keyof PolicyValues[A])[] };

const days = z.number().min(0).max(366).multipleOf(0.5);
const minutes = (max: number) => z.coerce.number().int().min(0).max(max);
/** A contribution rate in percent, kept with two decimals as payroll settings keep it. */
const rate = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, 'A percentage such as 7 or 8.5')
  .refine((v) => Number(v) <= 30, 'At most 30%')
  .transform((v) => Number(v).toFixed(2));

/** What a company may override in each area; anything left out follows the group. */
export const POLICY_OVERRIDE_SCHEMAS = {
  leave_type: z.object({
    daysPerYear: days.optional(),
    carryForwardMax: days.optional(),
    maxDaysPerRequest: z.number().int().min(1).max(366).nullable().optional(),
  }),
  attendance: z.object({
    selfPunch: z.enum(SELF_PUNCH_MODES).optional(),
    requireSelfie: z.boolean().optional(),
  }),
  provident_fund: z.object({ pfEmployeeRate: rate.optional(), pfEmployerRate: rate.optional() }),
  overtime_caps: z.object({
    overtimeDailyCapMinutes: minutes(1440).optional(),
    overtimeWeeklyCapMinutes: minutes(7 * 1440).optional(),
    overtimeMonthlyCapMinutes: minutes(31 * 1440)
      .nullable()
      .optional(),
  }),
} satisfies { [A in PolicyArea]: z.ZodType<PolicyOverride<A>, unknown> };

/**
 * A company's override as sent: the leave type it is for (leave types only) and the values it
 * changes, checked against the area's own schema by the API.
 */
export const policyOverrideSchema = z.object({
  subjectId: z.uuid().optional(),
  values: z.record(z.string(), z.unknown()),
});
export type PolicyOverrideInput = z.infer<typeof policyOverrideSchema>;

export const policySubjectQuerySchema = z.object({ subjectId: z.uuid().optional() });
export type PolicySubjectQuery = z.infer<typeof policySubjectQuerySchema>;

/** Numbers stored as text ("7.00") and as given ("7") are the same value. */
const same = (a: unknown, b: unknown) =>
  a === b ||
  (typeof a === 'string' && typeof b === 'string' && a !== '' && Number(a) === Number(b));

/** A company's policy: the group's values, with each value the company overrides. */
export function effectivePolicy<T extends object>(group: T, override?: Partial<T> | null): T {
  if (!override) return group;
  const out = { ...group };
  for (const key of Object.keys(group) as (keyof T)[]) {
    if (override[key] !== undefined) out[key] = override[key] as T[keyof T];
  }
  return out;
}

/** The fields an override sets to something other than the group's value. */
export function policyDifferences<T extends object>(
  group: T,
  override?: Partial<T> | null,
): (keyof T & string)[] {
  if (!override) return [];
  return (Object.keys(group) as (keyof T & string)[]).filter(
    (key) => override[key] !== undefined && !same(override[key], group[key]),
  );
}

export interface CompanyRef {
  id: string;
  code: string | null;
  name: string;
}

export interface CompanyPolicyView<A extends PolicyArea> {
  legalEntity: CompanyRef;
  /** What the company overrides; null when it follows the group. */
  override: PolicyOverride<A> | null;
  effective: PolicyValues[A];
  /** Overridden fields whose value differs from the group's. */
  differs: (keyof PolicyValues[A] & string)[];
  updatedAt: string | null;
}

interface PolicyViewOf<A extends PolicyArea> {
  area: A;
  /** The leave type, for `leave_type`. */
  leaveType: {
    id: string;
    code: string;
    name: string;
    nameBn: string | null;
    statutoryKey: StatutoryLeave | null;
    accrual: LeaveAccrual;
  } | null;
  group: PolicyValues[A];
  companies: CompanyPolicyView<A>[];
}
export type PolicyView = { [A in PolicyArea]: PolicyViewOf<A> }[PolicyArea];

export interface GroupPoliciesView {
  companies: CompanyRef[];
  /** Attendance, the provident fund, overtime caps, then each leave type in use. */
  policies: PolicyView[];
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');

export const groupDashboardQuerySchema = z.object({ month: month.optional() });
export type GroupDashboardQuery = z.infer<typeof groupDashboardQuerySchema>;

/** The month's figures for a company, or for the group as a whole. */
export interface GroupFigures {
  /** On the books at the end of the month's last day. */
  headcount: number;
  joiners: number;
  leavers: number;
  /** Leavers in the twelve months to the month's end over the average headcount, in percent. */
  attritionPercent: number | null;
  womenPercent: number | null;
  /** Service of those on the books at the month's end, in years. */
  averageServiceYears: number | null;
  overtimeHours: number;
  /** Working days attendance has processed so far in the month, and those absent. */
  workingDays: number;
  absentDays: number;
  absencePercent: number | null;
  /** Compliance alerts still open that were raised for a period starting by the month's end. */
  openAlerts: number;
  /** Gross pay and employer cost of the month's computed or locked runs; null without `payroll.view`. */
  payrollCost: { gross: string; employerCost: string; total: string } | null;
  /** Headcount at each month's end, oldest first, ending with this month. */
  trend: number[];
}

export interface GroupDashboardView {
  month: string;
  /** The trend's months, oldest first. */
  months: string[];
  payrollVisible: boolean;
  group: GroupFigures;
  companies: (GroupFigures & { legalEntity: CompanyRef })[];
}
