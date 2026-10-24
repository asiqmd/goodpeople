import { ruleOn, type IsoDate, type LegalReference } from '../engine.js';
import { BD_RULES, type EstablishmentKind } from './rules.js';

export type StatutoryLeave = 'casual' | 'sick' | 'annual' | 'maternity';
export type LeaveAccrual = 'annual_grant' | 'earned' | 'per_event';
export type ApprovalStep = 'manager' | 'hr';

/** A leave type's policy, as the country pack provisions it and as HR edits it. */
export interface LeavePolicy {
  code: string;
  name: string;
  nameBn: string;
  statutoryKey: StatutoryLeave | null;
  paid: boolean;
  accrual: LeaveAccrual;
  /** annual_grant: days credited for a full year. */
  daysPerYear: number | null;
  /** earned: company rate; null follows the statute for the employee's establishment. */
  workedDaysPerLeaveDay: number | null;
  /** per_event: most days in one request. */
  maxDaysPerRequest: number | null;
  carryForwardMax: number;
  minServiceDays: number;
  gender: 'male' | 'female' | null;
  /** Count weekly offs and holidays inside the leave (maternity counts calendar days). */
  countsOffDays: boolean;
  allowHalfDay: boolean;
  approvalChain: ApprovalStep[];
  requiresDocumentAfterDays: number | null;
}

/** The Bangladesh leave types every workspace starts with, at the statute's values on a date. */
export function bdLeaveDefaults(on: IsoDate): LeavePolicy[] {
  const value = <K extends keyof typeof BD_RULES & string>(key: K) =>
    ruleOn(BD_RULES, key, on).value;
  return [
    {
      code: 'CL',
      name: 'Casual leave',
      nameBn: 'নৈমিত্তিক ছুটি',
      statutoryKey: 'casual',
      paid: true,
      accrual: 'annual_grant',
      daysPerYear: value('leave.casual.days_per_year'),
      workedDaysPerLeaveDay: null,
      maxDaysPerRequest: null,
      carryForwardMax: 0,
      minServiceDays: 0,
      gender: null,
      countsOffDays: false,
      allowHalfDay: true,
      approvalChain: ['manager'],
      requiresDocumentAfterDays: null,
    },
    {
      code: 'SL',
      name: 'Sick leave',
      nameBn: 'অসুস্থতাজনিত ছুটি',
      statutoryKey: 'sick',
      paid: true,
      accrual: 'annual_grant',
      daysPerYear: value('leave.sick.days_per_year'),
      workedDaysPerLeaveDay: null,
      maxDaysPerRequest: null,
      carryForwardMax: 0,
      minServiceDays: 0,
      gender: null,
      countsOffDays: false,
      allowHalfDay: true,
      approvalChain: ['manager'],
      requiresDocumentAfterDays: 2,
    },
    {
      code: 'AL',
      name: 'Annual (earned) leave',
      nameBn: 'বার্ষিক (অর্জিত) ছুটি',
      statutoryKey: 'annual',
      paid: true,
      accrual: 'earned',
      daysPerYear: null,
      workedDaysPerLeaveDay: null,
      maxDaysPerRequest: null,
      carryForwardMax: value('leave.annual.carry_forward_max_days'),
      minServiceDays: value('leave.annual.min_service_days'),
      gender: null,
      countsOffDays: false,
      allowHalfDay: false,
      approvalChain: ['manager', 'hr'],
      requiresDocumentAfterDays: null,
    },
    {
      code: 'ML',
      name: 'Maternity leave',
      nameBn: 'মাতৃত্বকালীন ছুটি',
      statutoryKey: 'maternity',
      paid: true,
      accrual: 'per_event',
      daysPerYear: null,
      workedDaysPerLeaveDay: null,
      maxDaysPerRequest: value('leave.maternity.days'),
      carryForwardMax: 0,
      minServiceDays: value('leave.maternity.min_service_days'),
      gender: 'female',
      countsOffDays: true,
      allowHalfDay: false,
      approvalChain: ['hr'],
      requiresDocumentAfterDays: null,
    },
  ];
}

export interface FloorViolation {
  field: keyof LeavePolicy;
  message: string;
  reference: LegalReference;
}

/**
 * Statutory rules are a floor: a company may be more generous, never less. Returns what a
 * policy breaks on a date, quoting the law.
 */
export function bdLeaveFloorViolations(policy: LeavePolicy, on: IsoDate): FloorViolation[] {
  const out: FloorViolation[] = [];
  const check = <K extends keyof typeof BD_RULES & string>(
    key: K,
    field: keyof LeavePolicy,
    ok: (law: (typeof BD_RULES)[K]['versions'][number]['value']) => boolean,
    message: (law: (typeof BD_RULES)[K]['versions'][number]['value']) => string,
  ) => {
    const rule = ruleOn(BD_RULES, key, on);
    if (!ok(rule.value))
      out.push({ field, message: message(rule.value), reference: rule.reference });
  };

  switch (policy.statutoryKey) {
    case 'casual':
      check(
        'leave.casual.days_per_year',
        'daysPerYear',
        (law) => (policy.daysPerYear ?? 0) >= law,
        (law) => `Casual leave must be at least ${law} days a year`,
      );
      break;
    case 'sick':
      check(
        'leave.sick.days_per_year',
        'daysPerYear',
        (law) => (policy.daysPerYear ?? 0) >= law,
        (law) => `Sick leave must be at least ${law} days a year`,
      );
      break;
    case 'annual':
      check(
        'leave.annual.min_service_days',
        'minServiceDays',
        (law) => policy.minServiceDays <= law,
        (law) => `Annual leave cannot require more than ${law} days of service`,
      );
      check(
        'leave.annual.carry_forward_max_days',
        'carryForwardMax',
        (law) => policy.carryForwardMax >= law,
        (law) => `Unused annual leave must be allowed to accumulate to at least ${law} days`,
      );
      break;
    case 'maternity':
      check(
        'leave.maternity.days',
        'maxDaysPerRequest',
        (law) => (policy.maxDaysPerRequest ?? 0) >= law,
        (law) => `Maternity leave must be at least ${law} days`,
      );
      check(
        'leave.maternity.min_service_days',
        'minServiceDays',
        (law) => policy.minServiceDays <= law,
        (law) => `Maternity leave cannot require more than ${law} days of service`,
      );
      break;
  }
  return out;
}

/** Days worked per day of annual leave: the company rate if more generous, else the statute. */
export function bdEarnedLeaveRate(
  policyRate: number | null,
  establishment: EstablishmentKind,
  on: IsoDate,
): number {
  const statute = ruleOn(BD_RULES, 'leave.annual.worked_days_per_leave_day', on).value[
    establishment
  ];
  return policyRate === null ? statute : Math.min(policyRate, statute);
}

/** Maternity days: the company's figure if more generous, else the statute on the start date. */
export function bdMaternityDays(policyDays: number | null, on: IsoDate): number {
  return Math.max(policyDays ?? 0, ruleOn(BD_RULES, 'leave.maternity.days', on).value);
}
