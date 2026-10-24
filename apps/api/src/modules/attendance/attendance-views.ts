import { attendancePunches, employees } from '@gp/db';
import { shiftSpanMinutes, spansMidnight } from '@gp/shared';
import type {
  AttendanceDayView,
  AttendanceTotals,
  EmployeeRef,
  PunchView,
  RegularizationKind,
  RegularizationStatus,
  ShiftRef,
  ShiftView,
} from '@gp/shared';
import type { ComputedDay } from './processor.service.js';
import { hhmm, type ShiftRow } from './schedule.service.js';

export const employeeRef = (
  e: Pick<typeof employees.$inferSelect, 'id' | 'employeeCode' | 'fullName' | 'fullNameBn'>,
): EmployeeRef => ({
  id: e.id,
  employeeCode: e.employeeCode,
  fullName: e.fullName,
  fullNameBn: e.fullNameBn,
});

export const toShiftRef = (s: ShiftRow): ShiftRef => ({
  id: s.id,
  code: s.code,
  name: s.name,
  nameBn: s.nameBn,
  startTime: hhmm(s.startTime),
  endTime: hhmm(s.endTime),
});

export function toShiftView(s: ShiftRow): ShiftView {
  const [startTime, endTime] = [hhmm(s.startTime), hhmm(s.endTime)];
  return {
    ...toShiftRef(s),
    spansMidnight: spansMidnight(startTime, endTime),
    workMinutes: shiftSpanMinutes(startTime, endTime) - s.breakMinutes,
    breakMinutes: s.breakMinutes,
    lateGraceMinutes: s.lateGraceMinutes,
    earlyOutGraceMinutes: s.earlyOutGraceMinutes,
    halfDayMinutes: s.halfDayMinutes,
    fullDayMinutes: s.fullDayMinutes,
    overtimeEnabled: s.overtimeEnabled,
    overtimeMinMinutes: s.overtimeMinMinutes,
    overtimeRoundingMinutes: s.overtimeRoundingMinutes,
    isDefault: s.isDefault,
    isActive: s.isActive,
  };
}

export type RegularizationMark = {
  id: string;
  date: string;
  kind: RegularizationKind;
  status: RegularizationStatus;
};

export function toDayView(
  day: ComputedDay,
  regularization?: RegularizationMark,
): AttendanceDayView {
  const { plan, result } = day;
  return {
    date: plan.date,
    dayType: plan.dayType,
    holidayName: plan.holidayName,
    status: result.status,
    shift: toShiftRef(plan.shift),
    shiftSource: plan.shiftSource,
    leave: day.leave,
    firstIn: result.firstIn?.toISOString() ?? null,
    lastOut: result.lastOut?.toISOString() ?? null,
    workedMinutes: result.workedMinutes,
    lateMinutes: result.lateMinutes,
    earlyOutMinutes: result.earlyOutMinutes,
    overtimeMinutes: result.overtimeMinutes,
    flags: result.flags,
    regularization: regularization
      ? { id: regularization.id, kind: regularization.kind, status: regularization.status }
      : null,
  };
}

type Countable = Pick<AttendanceDayView, 'status' | 'flags' | 'workedMinutes' | 'overtimeMinutes'>;

export function totalsOf(days: Countable[]): AttendanceTotals {
  const totals: AttendanceTotals = {
    present: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    missingPunch: 0,
    late: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
  };
  for (const d of days) {
    if (d.status === 'present') totals.present += 1;
    else if (d.status === 'half_day') totals.halfDay += 1;
    else if (d.status === 'absent') totals.absent += 1;
    else if (d.status === 'on_leave') totals.onLeave += 1;
    else if (d.status === 'missing_punch') totals.missingPunch += 1;
    if (d.flags.includes('late')) totals.late += 1;
    totals.workedMinutes += d.workedMinutes;
    totals.overtimeMinutes += d.overtimeMinutes;
  }
  return totals;
}

export function toPunchView(
  p: typeof attendancePunches.$inferSelect,
  device: { id: string; name: string } | null,
): PunchView {
  return {
    id: p.id,
    punchedAt: p.punchedAt.toISOString(),
    source: p.source,
    direction: p.direction,
    device,
    distanceM: p.distanceM,
    insideGeofence: p.insideGeofence,
    note: p.voidReason ?? p.note,
    voided: p.voidedAt !== null,
    selfieDocumentId: p.selfieDocumentId,
  };
}
