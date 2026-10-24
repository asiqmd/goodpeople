import type { Gender } from './hr.js';
import type { Ref } from './hr-types.js';
import type {
  ApprovalStatus,
  ApprovalStepKind,
  ExcludedDay,
  HalfDay,
  HolidayKind,
  LeaveAccrual,
  LeaveRequestStatus,
  StatutoryLeave,
} from './leave.js';

export interface RuleView {
  key: string;
  title: string;
  value: unknown;
  from: string;
  to: string | null;
  reference: { act: string; section: string };
  status: 'verified' | 'needs_review';
  note?: string;
}

export interface HolidayCalendarView {
  id: string;
  name: string;
  isDefault: boolean;
  locations: Ref[];
}

export interface HolidayView {
  id: string;
  calendarId: string;
  date: string;
  name: string;
  nameBn: string | null;
  kind: HolidayKind;
  isTentative: boolean;
}

/** A calendar's holidays for one year, with the Labour Act festival-holiday check. */
export interface HolidayYearView {
  calendar: HolidayCalendarView;
  year: number;
  holidays: HolidayView[];
  festivalDays: number;
  festivalDaysRequired: number;
  festivalRule: RuleView;
}

export interface HolidayChangeResult {
  holiday: HolidayView | null;
  /** Leave requests whose day count changed because of this holiday. */
  recalculatedRequests: number;
}

export interface LeaveTypeView {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  statutoryKey: StatutoryLeave | null;
  paid: boolean;
  accrual: LeaveAccrual;
  daysPerYear: number | null;
  workedDaysPerLeaveDay: number | null;
  maxDaysPerRequest: number | null;
  carryForwardMax: number;
  minServiceDays: number;
  gender: Gender | null;
  countsOffDays: boolean;
  allowHalfDay: boolean;
  approvalChain: ApprovalStepKind[];
  requiresDocumentAfterDays: number | null;
  isActive: boolean;
}

export interface LeaveBalanceView {
  leaveType: Pick<LeaveTypeView, 'id' | 'code' | 'name' | 'nameBn' | 'accrual' | 'paid'>;
  year: number;
  /** null for per-event leave (maternity), which has no yearly balance. */
  entitlement: number | null;
  carriedForward: number;
  adjustments: number;
  taken: number;
  pending: number;
  available: number | null;
  /** When the employee first becomes eligible, if not yet. */
  eligibleFrom: string | null;
}

export interface ApprovalStepView {
  id: string;
  stepNo: number;
  kind: ApprovalStepKind;
  approver: { id: string; fullName: string } | null;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
}

export interface LeaveRequestView {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string };
  leaveType: Pick<LeaveTypeView, 'id' | 'code' | 'name' | 'nameBn'>;
  startDate: string;
  endDate: string;
  halfDay: HalfDay | null;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  needsDocument: boolean;
  steps: ApprovalStepView[];
  createdAt: string;
  decidedAt: string | null;
}

export interface LeavePreview {
  days: number;
  excluded: ExcludedDay[];
  balance: LeaveBalanceView | null;
  /** Why the request would be refused; empty when it can be submitted. */
  problems: string[];
}

export interface LeaveCalendarEntry {
  requestId: string;
  employee: { id: string; fullName: string; employeeCode: string };
  leaveType: { code: string; name: string; nameBn: string | null };
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
}

export interface LeaveCalendarView {
  from: string;
  to: string;
  holidays: HolidayView[];
  entries: LeaveCalendarEntry[];
}

export interface LeaveLedgerEntryView {
  id: string;
  leaveType: { id: string; code: string };
  year: number;
  kind: string;
  days: number;
  note: string | null;
  createdAt: string;
}
