import { z } from 'zod';
import { addDays } from './dates.js';
import type { EmployeeRef } from './attendance-types.js';
import type { Ref } from './hr-types.js';
import { reasonSchema } from './schemas.js';

export const LEARNING_CATEGORIES = [
  'fire_safety',
  'health_safety',
  'anti_harassment',
  'other',
] as const;
export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];
export const learningCourseSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,30}$/),
  name: z.string().trim().min(2).max(160),
  nameBn: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).default(''),
  descriptionBn: z.string().trim().max(4000).default(''),
  category: z.enum(LEARNING_CATEGORIES),
  validityMonths: z.number().int().min(1).max(120).nullable().default(null),
});
export type LearningCourseInput = z.infer<typeof learningCourseSchema>;
export interface LearningCourseView extends LearningCourseInput {
  id: string;
  isActive: boolean;
}
export const learningSessionSchema = z
  .object({
    courseId: z.uuid(),
    legalEntityId: z.uuid(),
    locationId: z.uuid().nullable().default(null),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    trainer: z.string().trim().min(2).max(160),
    venue: z.string().trim().min(2).max(300),
    capacity: z.number().int().min(1).max(5000),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    path: ['endsAt'],
    message: 'End must be after start',
  });
export type LearningSessionInput = z.infer<typeof learningSessionSchema>;
export const learningEnrolSchema = z.object({
  employeeId: z.uuid().optional(),
  employeeCode: z.string().trim().min(1).max(40).optional(),
});
export const learningAttendanceSchema = z
  .object({
    attendance: z
      .array(z.object({ employeeId: z.uuid(), status: z.enum(['attended', 'absent']) }))
      .min(1)
      .max(5000),
    note: reasonSchema,
  })
  .refine((v) => new Set(v.attendance.map((a) => a.employeeId)).size === v.attendance.length, {
    path: ['attendance'],
    message: 'Each person appears once',
  });
export type LearningAttendanceInput = z.infer<typeof learningAttendanceSchema>;
export const learningRequirementSchema = z
  .object({
    courseId: z.uuid(),
    legalEntityId: z.uuid(),
    designationId: z.uuid(),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date().nullable().default(null),
    graceDays: z.number().int().min(0).max(365).default(0),
  })
  .refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'End must be on or after start',
  });
export type LearningRequirementInput = z.infer<typeof learningRequirementSchema>;
export interface LearningRequirementView extends LearningRequirementInput {
  id: string;
  course: LearningCourseView;
  company: Ref;
  designation: Ref;
}
export const learningRetireSchema = z.object({ effectiveTo: z.iso.date(), reason: reasonSchema });
export const learningReasonSchema = z.object({ reason: reasonSchema });
export const fireDrillSchema = z
  .object({
    legalEntityId: z.uuid(),
    locationId: z.uuid(),
    heldOn: z.iso.date(),
    nextDueOn: z.iso.date(),
    participants: z.number().int().min(1).max(100000),
    evacuationSeconds: z.number().int().min(1).max(86400),
    conductor: z.string().trim().min(2).max(160),
    findings: z.string().trim().min(5).max(4000),
    actions: z.string().trim().min(5).max(4000),
  })
  .refine((v) => v.nextDueOn > v.heldOn, {
    path: ['nextDueOn'],
    message: 'Next drill is after the recorded drill',
  });
export type FireDrillInput = z.infer<typeof fireDrillSchema>;
export interface FireDrillView extends FireDrillInput {
  id: string;
  company: Ref;
  location: Ref;
  voidedAt: string | null;
  voidReason: string | null;
}
export const learningCoverageQuerySchema = z.object({
  on: z.iso.date().optional(),
  legalEntityId: z.uuid().optional(),
  locationId: z.uuid().optional(),
});
export type LearningCoverageQuery = z.infer<typeof learningCoverageQuerySchema>;
export const learningLanguageSchema = z.object({ language: z.enum(['en', 'bn']).default('en') });
export type TrainingState = 'current' | 'due' | 'overdue';
export interface TrainingCoverageRow {
  employee: EmployeeRef;
  company: Ref;
  designation: Ref;
  course: LearningCourseView;
  state: TrainingState;
  dueOn: string;
  expiresOn: string | null;
  certificateId: string | null;
}
export interface TrainingCertificateView {
  id: string;
  number: string;
  employee: EmployeeRef;
  company: Ref;
  courseId: string;
  courseName: string;
  courseNameBn: string;
  trainer: string;
  completedOn: string;
  expiresOn: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}
export interface LearningSessionView extends LearningSessionInput {
  id: string;
  course: LearningCourseView;
  company: Ref;
  location: Ref | null;
  status: 'planned' | 'completed' | 'cancelled';
  enrolled: number;
  myStatus: string | null;
  canEnrol: boolean;
  canWithdraw: boolean;
  canComplete: boolean;
  manage: boolean;
  note: string | null;
  attendance: {
    employee: EmployeeRef;
    status: 'enrolled' | 'cancelled' | 'attended' | 'absent';
    certificateId?: string | null;
  }[];
}
export interface LearningMe {
  asOf: string;
  employee: EmployeeRef | null;
  manage: boolean;
  manager: boolean;
  sessions: LearningSessionView[];
  certificates: TrainingCertificateView[];
  requirements: TrainingCoverageRow[];
}
export interface TrainingAuditSection {
  asOf: string;
  required: number;
  current: number;
  due: number;
  overdue: number;
  gaps: TrainingCoverageRow[];
  completions: number;
  drills: FireDrillView[];
}

/** Add calendar months, clamping leap days and month ends; expiry is inclusive. */
export function trainingExpiry(completedOn: string, validityMonths: number | null): string | null {
  if (validityMonths === null) return null;
  const [year, month, day] = completedOn.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + validityMonths, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return addDays(target.toISOString().slice(0, 10), -1);
}
export const trainingDueOn = (jobStart: string, policyStart: string, graceDays: number) =>
  addDays(jobStart > policyStart ? jobStart : policyStart, graceDays);
export function trainingState(
  on: string,
  dueOn: string,
  certificates: {
    completedOn: string;
    expiresOn: string | null;
    revokedAt: Date | string | null;
  }[],
): TrainingState {
  if (
    certificates.some(
      (c) => !c.revokedAt && c.completedOn <= on && (!c.expiresOn || c.expiresOn >= on),
    )
  )
    return 'current';
  return on > dueOn ? 'overdue' : 'due';
}
