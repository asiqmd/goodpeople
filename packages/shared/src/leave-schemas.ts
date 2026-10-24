import { z } from 'zod';
import { GENDERS } from './hr.js';
import { CHAIN_STEP_KINDS, HALF_DAYS, HOLIDAY_KINDS, LEAVE_ACCRUALS } from './leave.js';
import { withoutDefaults } from './zod-helpers.js';

const isoDate = z.iso.date();
const id = z.uuid();
const days = z.number().min(0).max(366).multipleOf(0.5);

// ── Holidays ─────────────────────────────────────────────────────────────────

export const holidayCalendarInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  isDefault: z.boolean().default(false),
});
export const holidayCalendarUpdateSchema = z
  .object(withoutDefaults(holidayCalendarInputSchema.shape))
  .partial();
export type HolidayCalendarInput = z.infer<typeof holidayCalendarInputSchema>;
export type HolidayCalendarUpdate = z.infer<typeof holidayCalendarUpdateSchema>;

export const holidayInputSchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2).max(160),
  nameBn: z.string().trim().max(160).optional(),
  kind: z.enum(HOLIDAY_KINDS),
  /** A lunar date not yet confirmed by the moon-sighting announcement. */
  isTentative: z.boolean().default(false),
});
export const holidayUpdateSchema = z.object(withoutDefaults(holidayInputSchema.shape)).partial();
export type HolidayInput = z.infer<typeof holidayInputSchema>;
export type HolidayUpdate = z.infer<typeof holidayUpdateSchema>;

export const importHolidaysSchema = z.object({ year: z.number().int().min(2020).max(2100) });

export const holidayYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
});

// ── Leave types ──────────────────────────────────────────────────────────────

const leaveTypeFields = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{0,9}$/, 'Use up to 10 capital letters, digits or underscores'),
  name: z.string().trim().min(2).max(80),
  nameBn: z.string().trim().max(80).optional(),
  paid: z.boolean(),
  accrual: z.enum(LEAVE_ACCRUALS),
  daysPerYear: days.nullable().optional(),
  workedDaysPerLeaveDay: z.number().int().min(1).max(60).nullable().optional(),
  maxDaysPerRequest: z.number().int().min(1).max(366).nullable().optional(),
  carryForwardMax: days.default(0),
  minServiceDays: z.number().int().min(0).max(3650).default(0),
  gender: z.enum(GENDERS).nullable().optional(),
  countsOffDays: z.boolean().default(false),
  allowHalfDay: z.boolean().default(true),
  approvalChain: z
    .array(z.enum(CHAIN_STEP_KINDS))
    .max(3)
    .refine((steps) => new Set(steps).size === steps.length, 'Each step can appear once'),
  requiresDocumentAfterDays: z.number().int().min(0).max(366).nullable().optional(),
};

export const leaveTypeInputSchema = z.object(leaveTypeFields).superRefine((t, ctx) => {
  if (t.accrual === 'annual_grant' && t.daysPerYear == null) {
    ctx.addIssue({ code: 'custom', message: 'Days per year is required', path: ['daysPerYear'] });
  }
  if (t.accrual === 'per_event' && t.maxDaysPerRequest == null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Most days per request is required',
      path: ['maxDaysPerRequest'],
    });
  }
});
/** Code and accrual are fixed once a type exists, so balances keep their meaning. */
export const leaveTypeUpdateSchema = z
  .object(withoutDefaults(leaveTypeFields))
  .omit({ code: true, accrual: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type LeaveTypeInput = z.infer<typeof leaveTypeInputSchema>;
export type LeaveTypeUpdate = z.infer<typeof leaveTypeUpdateSchema>;

// ── Requests and approvals ───────────────────────────────────────────────────

export const leaveRequestInputSchema = z
  .object({
    leaveTypeId: id,
    startDate: isoDate,
    endDate: isoDate,
    halfDay: z.enum(HALF_DAYS).nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((r, ctx) => {
    if (r.endDate < r.startDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'The leave ends before it starts',
        path: ['endDate'],
      });
    }
    if (r.halfDay && r.startDate !== r.endDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'A half day starts and ends on the same date',
        path: ['halfDay'],
      });
    }
    if (r.startDate.slice(0, 4) !== r.endDate.slice(0, 4)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Leave cannot cross 31 December: split it into two requests',
        path: ['endDate'],
      });
    }
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;

/** The preview takes the same body but never fails on reason. */
export const leavePreviewSchema = z.object({
  leaveTypeId: id,
  startDate: isoDate,
  endDate: isoDate,
  halfDay: z.enum(HALF_DAYS).nullable().optional(),
});
export type LeavePreviewInput = z.infer<typeof leavePreviewSchema>;

export const decisionSchema = z.object({ comment: z.string().trim().max(500).optional() });
export type DecisionInput = z.infer<typeof decisionSchema>;

export const leaveAdjustmentSchema = z.object({
  leaveTypeId: id,
  year: z.number().int().min(2000).max(2100),
  days: z
    .number()
    .min(-366)
    .max(366)
    .multipleOf(0.5)
    .refine((d) => d !== 0, 'Use a non-zero number of days'),
  kind: z.enum(['adjustment', 'opening']).default('adjustment'),
  note: z.string().trim().min(3).max(300),
});
export type LeaveAdjustmentInput = z.infer<typeof leaveAdjustmentSchema>;

export const leaveCalendarQuerySchema = z
  .object({ from: isoDate, to: isoDate, orgUnitId: id.optional() })
  .refine((q) => q.from <= q.to, { message: '"from" must not be after "to"', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 62 * 24 * 60 * 60 * 1000, {
    message: 'Show at most 62 days at a time',
    path: ['to'],
  });

export const leaveYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const leaveListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
