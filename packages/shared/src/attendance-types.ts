import type {
  AttendanceFlag,
  AttendanceStatus,
  DayType,
  DeviceVendor,
  PunchDirection,
  PunchSource,
  RegularizationKind,
  RegularizationStatus,
  SelfPunchMode,
} from './attendance.js';
import type { Ref } from './hr-types.js';
import type { ApprovalStepKind } from './leave.js';
import type { ApprovalStepView, LeaveBalanceView, LeaveRequestView } from './leave-types.js';
import type { SeparationApprovalItem } from './lifecycle-types.js';
import type {
  CompensationApprovalItem,
  LoanApprovalItem,
  PayBatchApprovalItem,
  PayrollRunApprovalItem,
} from './payroll-types.js';
import type { TimesheetApprovalItem } from './timesheets.js';

export interface EmployeeRef {
  id: string;
  employeeCode: string;
  fullName: string;
  fullNameBn: string | null;
}

export interface ShiftView {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  /** HH:MM local time. */
  startTime: string;
  endTime: string;
  spansMidnight: boolean;
  /** Scheduled work, without the break. */
  workMinutes: number;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyOutGraceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  overtimeEnabled: boolean;
  overtimeMinMinutes: number;
  overtimeRoundingMinutes: number;
  isDefault: boolean;
  isActive: boolean;
}

export type ShiftRef = Pick<ShiftView, 'id' | 'code' | 'name' | 'nameBn' | 'startTime' | 'endTime'>;

export interface ShiftAssignmentView {
  id: string;
  shift: ShiftRef;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** One employee's day. Past days come from processing; today and later are projected. */
export interface AttendanceDayView {
  date: string;
  dayType: DayType;
  holidayName: string | null;
  status: AttendanceStatus;
  shift: ShiftRef | null;
  /** Where the shift came from: a roster entry, the employee's assignment or the default. */
  shiftSource: 'roster' | 'assignment' | 'default';
  leave: { requestId: string; code: string; days: number } | null;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  flags: AttendanceFlag[];
  /** A regularization asked for this day, if any is open or approved. */
  regularization: { id: string; kind: RegularizationKind; status: RegularizationStatus } | null;
}

export interface AttendanceTotals {
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  missingPunch: number;
  late: number;
  workedMinutes: number;
  overtimeMinutes: number;
}

export interface AttendanceRangeView {
  employee: EmployeeRef;
  timeZone: string;
  from: string;
  to: string;
  days: AttendanceDayView[];
  totals: AttendanceTotals;
}

export interface PunchView {
  id: string;
  punchedAt: string;
  source: PunchSource;
  /** Recorded by the app without a connection and received later. */
  offline: boolean;
  direction: PunchDirection;
  device: { id: string; name: string } | null;
  distanceM: number | null;
  insideGeofence: boolean | null;
  note: string | null;
  voided: boolean;
  /** The photo taken with an app punch, a document readable by HR. */
  selfieDocumentId: string | null;
}

export interface MyAttendanceToday {
  employee: EmployeeRef;
  timeZone: string;
  day: AttendanceDayView;
  punches: PunchView[];
  selfPunch: {
    mode: SelfPunchMode;
    /** Why punching from the app is not possible, if it is not. */
    blockedReason: 'disabled' | 'no_geofence' | null;
    geofence: { latitude: number; longitude: number; radiusM: number } | null;
    requireSelfie: boolean;
  };
  nextDirection: 'in' | 'out';
}

export interface TeamDayView {
  date: string;
  counts: Partial<Record<AttendanceStatus, number>>;
  rows: { employee: EmployeeRef; timeZone: string; day: AttendanceDayView }[];
}

export interface MonthSummaryRow {
  employee: EmployeeRef;
  totals: AttendanceTotals;
  /** Weeks (Saturday to Friday) over the Labour Act's 60 hours, overtime included. */
  weeksOverLimit: number;
}

export interface MonthSummaryView {
  month: string;
  from: string;
  to: string;
  rows: MonthSummaryRow[];
}

export interface RosterDay {
  date: string;
  shift: Pick<ShiftView, 'id' | 'code'> | null;
  source: 'roster' | 'assignment' | 'default';
  dayType: DayType;
}

export interface RosterView {
  from: string;
  to: string;
  rows: { employee: EmployeeRef; days: RosterDay[] }[];
}

export interface EmployeeAttendanceView {
  attendancePin: string | null;
  shifts: ShiftAssignmentView[];
  range: AttendanceRangeView;
  punches: PunchView[];
}

export interface AttendanceSettingsView {
  selfPunch: SelfPunchMode;
  regularizationChain: ApprovalStepKind[];
  regularizationWindowDays: number;
  trackingFrom: string;
  requireSelfie: boolean;
}

export interface EdgeAgentView {
  id: string;
  name: string;
  /** The token's first characters, to tell agents apart; the secret is never shown again. */
  tokenPrefix: string;
  agentVersion: string | null;
  queued: number | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface EdgeAgentCreated extends EdgeAgentView {
  token: string;
}

export interface DeviceView {
  id: string;
  serialNumber: string;
  vendor: DeviceVendor;
  name: string;
  location: Ref | null;
  agent: Ref | null;
  lastSeenAt: string | null;
}

export interface UnmatchedPunchGroup {
  deviceUserId: string;
  device: { id: string; name: string; serialNumber: string } | null;
  punches: number;
  first: string;
  last: string;
}

export interface RegularizationView {
  id: string;
  employee: EmployeeRef;
  date: string;
  kind: RegularizationKind;
  inTime: string | null;
  outTime: string | null;
  reason: string;
  status: RegularizationStatus;
  steps: ApprovalStepView[];
  createdAt: string;
  decidedAt: string | null;
}

export interface EdgePunchesResult {
  accepted: number;
  duplicates: number;
  unmatched: number;
}

export interface EdgeHeartbeatResult {
  serverTime: string;
  agentId: string;
}

// ── Approvals inbox ──────────────────────────────────────────────────────────

export interface LeaveApprovalItem {
  subjectType: 'leave_request';
  stepId: string;
  kind: ApprovalStepKind;
  request: LeaveRequestView;
  balance: LeaveBalanceView | null;
}

export interface RegularizationApprovalItem {
  subjectType: 'regularization';
  stepId: string;
  kind: ApprovalStepKind;
  regularization: RegularizationView;
  /** The day as processed now, to compare with what is asked. */
  day: AttendanceDayView | null;
}

/** One approval waiting for the signed-in user. */
export type ApprovalItem =
  | LeaveApprovalItem
  | RegularizationApprovalItem
  | SeparationApprovalItem
  | CompensationApprovalItem
  | PayrollRunApprovalItem
  | LoanApprovalItem
  | PayBatchApprovalItem
  | TimesheetApprovalItem;
