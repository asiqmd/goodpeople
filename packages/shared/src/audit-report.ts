import { z } from 'zod';
import type { CommitteeKind } from './relations.js';
import type { ComplianceAlertKind } from './compliance.js';
import type { GrievanceCategory, GrievanceStatus } from './grievances.js';

// The buyer-audit report (Phase 3 M3): what a social-compliance auditor checks in a garment
// factory — hours, overtime, wages against the wage board, leave, maternity, adolescents,
// committees, grievances — for a period and an establishment, from the records themselves.

export const auditReportQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    legalEntityId: z.uuid().optional(),
    locationId: z.uuid().optional(),
    format: z.enum(['json', 'pdf', 'csv']).default('json'),
    language: z.enum(['en', 'bn']).default('en'),
  })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'The end is before the start' })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, {
    path: ['to'],
    message: 'A report covers at most a year',
  });
export type AuditReportQuery = z.infer<typeof auditReportQuerySchema>;

export interface AuditReportView {
  from: string;
  to: string;
  establishment: { entity: string | null; location: string | null };
  generatedAt: string;
  workforce: {
    total: number;
    workers: number;
    staff: number;
    women: number;
    men: number;
    adolescents: {
      code: string;
      name: string;
      age: number;
      certificateUntil: string | null;
    }[];
    /** Under 14 at the end of the period: should be none (s.34). */
    children: number;
  };
  hours: {
    /** False where attendance is not tracked for the period. */
    tracked: boolean;
    workerWeeks: number;
    weeksOver48: number;
    weeksOver60: number;
    maxWeeklyHours: number;
    averageWeeklyHours: number;
    daysOver10: number;
    /** People who worked seven or more days in a row (s.103). */
    withoutWeeklyHoliday: number;
    longest: { code: string; name: string; weekStart: string; hours: number; overtime: number }[];
  };
  overtime: {
    totalHours: number;
    people: number;
    maxMonthlyHours: number;
    averageMonthlyHours: number;
    monthlyCapHours: number | null;
    overMonthlyCap: number;
    /** Overtime hours recorded by attendance against those paid in locked runs. */
    paid: { runs: number; recordedHours: number; paidHours: number; differences: number };
  };
  wages: {
    runs: {
      period: string;
      payGroup: string;
      kind: string;
      status: string;
      paymentDue: string;
      paidOn: string | null;
      late: boolean;
    }[];
    onWageBoard: number;
    belowMinimum: {
      code: string;
      name: string;
      grade: string;
      gross: string;
      minimumGross: string;
      board: string;
    }[];
  };
  leave: {
    byType: { code: string; name: string; days: number; people: number }[];
    festivalHolidays: number;
    maternity: {
      cases: number;
      eligible: number;
      partsDue: number;
      paidOnTime: number;
      paidLate: number;
      overdue: number;
    };
  };
  committees: {
    kind: CommitteeKind;
    name: string;
    formedOn: string;
    endsOn: string | null;
    workerMembers: number;
    employerMembers: number;
    lastMeeting: string | null;
    meetingsInPeriod: number;
  }[];
  unions: { name: string; isCba: boolean; members: number; checkOff: boolean }[];
  grievances: {
    total: number;
    byCategory: Partial<Record<GrievanceCategory, number>>;
    byStatus: Partial<Record<GrievanceStatus, number>>;
    /** Open more than the 30 days the Act gives for a decision (s.33). */
    overdue: number;
    medianDaysToFirstReply: number | null;
  };
  alerts: { kind: ComplianceAlertKind; open: number; acknowledged: number; resolved: number }[];
}
