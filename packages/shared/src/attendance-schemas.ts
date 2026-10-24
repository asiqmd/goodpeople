import { z } from 'zod';
import {
  ATTENDANCE_STATUSES,
  DEVICE_VENDORS,
  PUNCH_DIRECTIONS,
  REGULARIZATION_KINDS,
  SELF_PUNCH_MODES,
} from './attendance.js';
import { APPROVAL_STEP_KINDS } from './leave.js';
import { withoutDefaults } from './zod-helpers.js';

const isoDate = z.iso.date();
const id = z.uuid();
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');
const minutes = (max: number) => z.number().int().min(0).max(max);
const reason = z.string().trim().min(3).max(500);

const DAY_MS = 24 * 60 * 60 * 1000;
/** A from–to date range of at most `days` days. */
const range = (days: number) =>
  z
    .object({ from: isoDate, to: isoDate })
    .refine((q) => q.to >= q.from, { message: 'The end date is before the start', path: ['to'] })
    .refine((q) => Date.parse(q.to) - Date.parse(q.from) < days * DAY_MS, {
      message: `At most ${days} days at a time`,
      path: ['to'],
    });

// ── Shifts and rosters ───────────────────────────────────────────────────────

const shiftFields = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_-]{0,9}$/, 'Use up to 10 capital letters, digits, - or _'),
  name: z.string().trim().min(2).max(80),
  nameBn: z.string().trim().max(80).optional(),
  startTime: timeOfDay,
  endTime: timeOfDay,
  breakMinutes: minutes(180).default(60),
  lateGraceMinutes: minutes(120).default(10),
  earlyOutGraceMinutes: minutes(120).default(0),
  halfDayMinutes: minutes(1440).default(240),
  fullDayMinutes: minutes(1440).default(360),
  overtimeEnabled: z.boolean().default(true),
  overtimeMinMinutes: minutes(240).default(30),
  overtimeRoundingMinutes: z.number().int().min(1).max(60).default(30),
  isDefault: z.boolean().default(false),
};

const dayThresholds = (
  s: { halfDayMinutes?: number; fullDayMinutes?: number },
  ctx: z.RefinementCtx,
) => {
  if (
    s.halfDayMinutes !== undefined &&
    s.fullDayMinutes !== undefined &&
    s.halfDayMinutes > s.fullDayMinutes
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['halfDayMinutes'],
      message: 'A half day cannot need more minutes than a full day',
    });
  }
};

export const shiftInputSchema = z
  .object(shiftFields)
  .superRefine(dayThresholds)
  .refine((s) => s.startTime !== s.endTime, {
    message: 'A shift cannot start and end at the same time',
    path: ['endTime'],
  });
export const shiftUpdateSchema = z
  .object(withoutDefaults({ ...shiftFields, isActive: z.boolean() }))
  .omit({ code: true })
  .partial()
  .superRefine(dayThresholds);
export type ShiftInput = z.infer<typeof shiftInputSchema>;
export type ShiftUpdate = z.infer<typeof shiftUpdateSchema>;

const employeeIds = z.array(id).min(1).max(500);

/** Puts employees on a shift from a date until they are moved to another. */
export const shiftAssignmentSchema = z.object({
  employeeIds,
  shiftId: id,
  effectiveFrom: isoDate,
});
export type ShiftAssignmentInput = z.infer<typeof shiftAssignmentSchema>;

/**
 * A rotating roster: each date in the range gets the next entry of the pattern, starting
 * again at the beginning when it runs out. null is a day off.
 */
export const rosterInputSchema = z.intersection(
  range(62),
  z.object({ employeeIds, pattern: z.array(id.nullable()).min(1).max(31) }),
);
export type RosterInput = z.infer<typeof rosterInputSchema>;

export const rosterClearSchema = z.intersection(range(62), z.object({ employeeIds }));
export type RosterClearInput = z.infer<typeof rosterClearSchema>;

export const rosterQuerySchema = z.intersection(
  range(31),
  z.object({ orgUnitId: id.optional(), locationId: id.optional() }),
);

// ── Punches ──────────────────────────────────────────────────────────────────

/** Punching in or out from the web or mobile app. Coordinates are needed for a geofence. */
export const selfPunchSchema = z
  .object({
    source: z.enum(['web', 'mobile']),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyM: z.number().min(0).max(100_000).optional(),
  })
  .refine((p) => (p.latitude === undefined) === (p.longitude === undefined), {
    message: 'Send both latitude and longitude, or neither',
    path: ['longitude'],
  });
export type SelfPunchInput = z.infer<typeof selfPunchSchema>;

/** HR records a punch by hand, in the employee's local time. */
export const manualPunchSchema = z.object({ date: isoDate, time: timeOfDay, reason });
export type ManualPunchInput = z.infer<typeof manualPunchSchema>;

export const voidPunchSchema = z.object({ reason });
export type VoidPunchInput = z.infer<typeof voidPunchSchema>;

// ── Reading and processing ───────────────────────────────────────────────────

export const attendanceRangeQuerySchema = range(62);

export const attendanceDailyQuerySchema = z.object({
  date: isoDate,
  orgUnitId: id.optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
});

export const attendanceMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
  orgUnitId: id.optional(),
});

export const attendanceProcessSchema = z.intersection(
  range(62),
  z.object({ employeeIds: employeeIds.optional() }),
);
export type AttendanceProcessInput = z.infer<typeof attendanceProcessSchema>;

/** The number an employee is enrolled under on the devices (ZKTeco PIN, Hikvision employee no.). */
export const attendanceProfileSchema = z.object({
  attendancePin: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,24}$/, 'Use up to 24 letters or digits')
    .nullable(),
});
export type AttendanceProfileInput = z.infer<typeof attendanceProfileSchema>;

export const attendanceSettingsSchema = z
  .object({
    selfPunch: z.enum(SELF_PUNCH_MODES),
    regularizationChain: z
      .array(z.enum(APPROVAL_STEP_KINDS))
      .max(3)
      .refine((steps) => new Set(steps).size === steps.length, 'Each step can appear once'),
    regularizationWindowDays: z.number().int().min(0).max(90),
    /** Attendance go-live; days before it are not processed. */
    trackingFrom: isoDate,
  })
  .partial();
export type AttendanceSettingsInput = z.infer<typeof attendanceSettingsSchema>;

// ── Regularization ───────────────────────────────────────────────────────────

export const regularizationInputSchema = z
  .object({
    date: isoDate,
    kind: z.enum(REGULARIZATION_KINDS),
    inTime: timeOfDay.optional(),
    outTime: timeOfDay.optional(),
    reason,
  })
  .superRefine((r, ctx) => {
    if (r.kind === 'missed_punch' && !r.inTime && !r.outTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['inTime'],
        message: 'Give the in time, the out time or both',
      });
    }
    if (r.kind === 'on_duty' && (r.inTime || r.outTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['inTime'],
        message: 'On-duty days count the whole shift, without times',
      });
    }
  });
export type RegularizationInput = z.infer<typeof regularizationInputSchema>;

export const regularizationListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
});

// ── Devices and edge agents ──────────────────────────────────────────────────

export const edgeAgentInputSchema = z.object({ name: z.string().trim().min(2).max(80) });
export type EdgeAgentInput = z.infer<typeof edgeAgentInputSchema>;

export const deviceUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    locationId: id.nullable(),
  })
  .partial();
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;

const deviceSerial = z.string().trim().min(1).max(64);

/** What a site's Edge Agent uploads: punches it buffered from the devices. */
export const edgePunchesSchema = z.object({
  punches: z
    .array(
      z.object({
        deviceSerial,
        vendor: z.enum(DEVICE_VENDORS),
        deviceUserId: z.string().trim().min(1).max(32),
        punchedAt: z.iso.datetime({ offset: true }),
        direction: z.enum(PUNCH_DIRECTIONS).default('unknown'),
      }),
    )
    .min(1)
    .max(500),
});
export type EdgePunchesInput = z.infer<typeof edgePunchesSchema>;

export const edgeHeartbeatSchema = z.object({
  agentVersion: z.string().trim().max(40),
  queued: z.number().int().min(0),
  devices: z
    .array(
      z.object({
        serialNumber: deviceSerial,
        vendor: z.enum(DEVICE_VENDORS),
        lastSeenAt: z.iso.datetime({ offset: true }),
        ip: z.string().max(64).optional(),
      }),
    )
    .max(200),
});
export type EdgeHeartbeatInput = z.infer<typeof edgeHeartbeatSchema>;
