import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import type { EmployeeStatus } from './hr.js';
import type { LeaveRequestStatus } from './leave.js';
import type { SeparationStatus, SeparationType } from './lifecycle.js';
import { moneySchema } from './payroll-schemas.js';

// Maternity benefit (Labour Act Chapter IV, Phase 3 M3): a case per expected birth, its
// eligibility, the average wage it is paid at and its payment in up to two parts.

/** s.47(4): (a) before and after delivery; (b) two parts after the birth; (c) all at once. */
export const MATERNITY_PAYMENT_OPTIONS = [
  'before_and_after',
  'after_birth_two_parts',
  'after_birth_at_once',
] as const;
export type MaternityPaymentOption = (typeof MATERNITY_PAYMENT_OPTIONS)[number];

export const MATERNITY_CASE_STATUSES = ['open', 'closed', 'cancelled'] as const;
export type MaternityCaseStatus = (typeof MATERNITY_CASE_STATUSES)[number];

export const MATERNITY_PAY_METHODS = ['cash', 'bank', 'mfs'] as const;
export type MaternityPayMethod = (typeof MATERNITY_PAY_METHODS)[number];

/** Why no benefit is payable: under six months' service, or two surviving children (s.46). */
export const MATERNITY_INELIGIBILITY = ['short_service', 'surviving_children'] as const;
export type MaternityIneligibility = (typeof MATERNITY_INELIGIBILITY)[number];

/**
 * waiting: its certificate or proof has not come yet; due and overdue: payable, by `dueOn`;
 * lost: proof of birth came too late, or not at all (s.47).
 */
export const MATERNITY_PART_STATUSES = ['waiting', 'due', 'overdue', 'paid', 'lost'] as const;
export type MaternityPartStatus = (typeof MATERNITY_PART_STATUSES)[number];

/** The days a part pays for: before the delivery, after it, or the whole benefit. */
export type MaternityPartCovers = 'before' | 'after' | 'whole';
/**
 * What starts a part's clock: the doctor's certificate (taken as given with the notice),
 * proof of birth, or proof of birth with eight weeks to pay (s.47(4)(b)).
 */
export type MaternityPartBasis = 'certificate' | 'proof' | 'after_proof';

const isoDate = z.iso.date();
const positive = moneySchema.refine((v) => Number(v) > 0, 'Enter more than zero');
const reason = z.string().trim().min(5).max(300);

type Dates = { deliveredOn?: string | null; proofOn?: string | null };
function checkDates(v: Dates, ctx: z.RefinementCtx) {
  if (v.proofOn && !v.deliveredOn) {
    ctx.addIssue({ code: 'custom', path: ['deliveredOn'], message: 'Enter the delivery first' });
  } else if (v.proofOn && v.deliveredOn && v.proofOn < v.deliveredOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['proofOn'],
      message: 'Proof of birth cannot come before the delivery',
    });
  }
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export const maternityCaseInputSchema = z
  .object({
    employeeId: z.uuid(),
    /** Her maternity leave, now or later. */
    leaveRequestId: z.uuid().nullable().optional(),
    noticeOn: isoDate,
    expectedDeliveryOn: isoDate,
    deliveredOn: isoDate.nullable().optional(),
    proofOn: isoDate.nullable().optional(),
    survivingChildren: z.coerce.number().int().min(0).max(20),
    nomineeName: z.string().trim().min(2).max(160).nullable().optional(),
    nomineeRelation: z.string().trim().min(2).max(60).nullable().optional(),
    paymentOption: z.enum(MATERNITY_PAYMENT_OPTIONS),
    /** Only when no locked pay covers the three months before the notice. */
    averageDailyWage: positive.nullable().optional(),
    averageReason: reason.nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    checkDates(v, ctx);
    if (v.averageDailyWage && !v.averageReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['averageReason'],
        message: 'Say why the average is entered by hand',
      });
    }
  });
export type MaternityCaseInput = z.infer<typeof maternityCaseInputSchema>;

/** The expected delivery as the doctor revises it, the delivery, and proof of birth. */
export const maternityDatesSchema = z
  .object({
    expectedDeliveryOn: isoDate.optional(),
    deliveredOn: isoDate.nullable(),
    proofOn: isoDate.nullable(),
  })
  .superRefine(checkDates);
export type MaternityDatesInput = z.infer<typeof maternityDatesSchema>;

/** Without an amount, the average is worked out again from locked pay. */
export const maternityAverageSchema = z
  .object({
    averageDailyWage: positive.nullable().optional(),
    reason: reason.nullable().optional(),
  })
  .refine((v) => !v.averageDailyWage || v.reason, {
    path: ['reason'],
    message: 'Say why the average is entered by hand',
  });
export type MaternityAverageInput = z.infer<typeof maternityAverageSchema>;

export const maternityPaymentSchema = z.object({
  paidOn: isoDate,
  method: z.enum(MATERNITY_PAY_METHODS),
  reference: z.string().trim().max(120).nullable().optional(),
});
export type MaternityPaymentInput = z.infer<typeof maternityPaymentSchema>;

export const maternityLeaveLinkSchema = z.object({ leaveRequestId: z.uuid().nullable() });
export type MaternityLeaveLinkInput = z.infer<typeof maternityLeaveLinkSchema>;

export const maternityCloseSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});
export type MaternityCloseInput = z.infer<typeof maternityCloseSchema>;

export const maternityCancelSchema = z.object({ reason: z.string().trim().min(5).max(500) });
export type MaternityCancelInput = z.infer<typeof maternityCancelSchema>;

export const maternityListQuerySchema = z.object({
  status: z.enum(MATERNITY_CASE_STATUSES).optional(),
});
export type MaternityListQuery = z.infer<typeof maternityListQuerySchema>;

export const maternityCandidateQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});

// ── Views ────────────────────────────────────────────────────────────────────

/** A country-pack rule as applied to the case, with its section of the Act. */
export interface MaternityRuleRef {
  key: string;
  value: number;
  reference: { act: string; section: string };
  status: 'verified' | 'needs_review';
}

export interface MaternityEligibility {
  eligible: boolean;
  reasons: MaternityIneligibility[];
  /** Days served from joining to the delivery (expected until it happens), against s.46. */
  service: {
    joinedOn: string;
    deliveryOn: string;
    days: number;
    ok: boolean;
    rule: MaternityRuleRef;
  };
  /** At two or more surviving children no benefit is payable, but leave still is. */
  children: { surviving: number; ok: boolean; rule: MaternityRuleRef };
}

/** One pay period of the three months before the notice (s.48). */
export interface MaternityWageMonth {
  periodStart: string;
  periodEnd: string;
  /** Earnings in the period's locked regular and adjustment runs, less absence and unpaid leave. */
  wages: string;
  /** Days actually worked, from the period's latest locked run. */
  workedDays: number;
}

export interface MaternityAverageView {
  source: 'payroll' | 'entered';
  /** The calendar months before the notice month whose wages are averaged. */
  windowStart: string;
  windowEnd: string;
  months: MaternityWageMonth[];
  /** Months of the window without locked pay, as YYYY-MM. */
  missingMonths: string[];
  wages: string | null;
  workedDays: number | null;
  averageDailyWage: string;
  /** Why HR entered the average by hand. */
  reason: string | null;
  rule: MaternityRuleRef;
}

export interface MaternityPartView {
  id: string;
  part: number;
  covers: MaternityPartCovers;
  days: number;
  amount: string;
  basis: MaternityPartBasis;
  status: MaternityPartStatus;
  dueOn: string | null;
  paidOn: string | null;
  method: MaternityPayMethod | null;
  reference: string | null;
  paidBy: string | null;
}

/** s.50: notice of dismissal or termination without cause in this window keeps the benefit. */
export interface MaternityProtectionView {
  from: string;
  to: string;
  rules: MaternityRuleRef[];
  /** Separations whose notice falls inside the window. */
  separations: {
    id: string;
    type: SeparationType;
    noticeDate: string;
    status: SeparationStatus;
  }[];
}

export interface MaternityLeaveRef {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveRequestStatus;
}

export interface MaternityCaseSummary {
  id: string;
  employee: EmployeeRef;
  noticeOn: string;
  expectedDeliveryOn: string;
  deliveredOn: string | null;
  proofOn: string | null;
  paymentOption: MaternityPaymentOption;
  status: MaternityCaseStatus;
  eligible: boolean;
  benefitDays: number;
  /** The whole benefit, once the average wage is known. */
  total: string | null;
  /** The next part to pay: the earliest due, else the first waiting. */
  next: { part: number; status: MaternityPartStatus; dueOn: string | null; amount: string } | null;
}

export interface MaternityCaseView extends MaternityCaseSummary {
  employee: EmployeeRef & { joinedOn: string; separatedOn: string | null; status: EmployeeStatus };
  survivingChildren: number;
  nomineeName: string | null;
  nomineeRelation: string | null;
  note: string | null;
  eligibility: MaternityEligibility;
  /** The benefit's days before the expected delivery and after the delivery (s.46). */
  daysBefore: number;
  daysAfter: number;
  rules: {
    benefitDays: MaternityRuleRef;
    daysBefore: MaternityRuleRef;
    paymentWorkingDays: MaternityRuleRef;
    proofWithinMonths: MaternityRuleRef;
  };
  average: MaternityAverageView | null;
  parts: MaternityPartView[];
  /** Proof of birth must come by this date, or the parts that wait for it are lost (s.47). */
  proofDeadline: string;
  proofLate: boolean;
  protection: MaternityProtectionView;
  leaveRequest: MaternityLeaveRef | null;
  /** Her maternity leave requests not linked to another case. */
  leaveOptions: MaternityLeaveRef[];
  createdAt: string;
}

/** A woman in active employment who can have a case opened. */
export interface MaternityCandidate extends EmployeeRef {
  joinedOn: string;
  openCaseId: string | null;
}
