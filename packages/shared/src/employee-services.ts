import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import type { Ref } from './hr-types.js';
import { reasonSchema } from './schemas.js';

export const SURVEY_MINIMUM = 5;
const title = z.string().trim().min(2).max(160);
const content = z.string().trim().min(2).max(10000);
export const serviceReasonSchema = z.object({ reason: reasonSchema });
export const serviceScopeSchema = z.object({ legalEntityId: z.uuid().optional() });
export const surveySchema = z.object({
  legalEntityId: z.uuid(),
  title,
  titleBn: title,
  description: content,
  descriptionBn: content,
  closesAt: z.iso.datetime({ offset: true }),
  threshold: z.number().int().min(SURVEY_MINIMUM).max(100).default(SURVEY_MINIMUM),
  questions: z
    .array(z.object({ text: title, textBn: title }))
    .max(10)
    .default([]),
});
export type SurveyInput = z.infer<typeof surveySchema>;
export const surveyResponseSchema = z
  .object({
    enps: z.number().int().min(0).max(10),
    scores: z.array(z.number().int().min(1).max(5)).max(10),
  })
  .strict();
export type SurveyResponseInput = z.infer<typeof surveyResponseSchema>;
export interface SurveyTotals {
  enps: number[];
  questions: number[][];
}
export function emptySurveyTotals(questions: number): SurveyTotals {
  return {
    enps: Array<number>(11).fill(0),
    questions: Array.from({ length: questions }, () => Array<number>(5).fill(0)),
  };
}
export function addSurveyResponse(totals: SurveyTotals, input: SurveyResponseInput): SurveyTotals {
  if (input.scores.length !== totals.questions.length) throw new Error('Answer every question');
  const next = structuredClone(totals);
  next.enps[input.enps]!++;
  input.scores.forEach((score, i) => next.questions[i]![score - 1]!++);
  return next;
}
export type SurveyResults =
  | { suppressed: true; minimum: number }
  | {
      suppressed: false;
      responses: number;
      eligible: number;
      enps: number;
      promoters: number;
      passives: number;
      detractors: number;
      questions: { mean: number; distribution: number[] }[];
    };
export function surveyResults(
  totals: SurveyTotals,
  eligible: number,
  threshold: number,
  closed: boolean,
): SurveyResults {
  const responses = totals.enps.reduce((n, v) => n + v, 0);
  if (!closed || responses < Math.max(SURVEY_MINIMUM, threshold))
    return { suppressed: true, minimum: Math.max(SURVEY_MINIMUM, threshold) };
  const promoters = totals.enps.slice(9).reduce((n, v) => n + v, 0);
  const passives = totals.enps.slice(7, 9).reduce((n, v) => n + v, 0);
  const detractors = responses - promoters - passives;
  return {
    suppressed: false,
    responses,
    eligible,
    promoters,
    passives,
    detractors,
    enps: Math.round(((promoters - detractors) / responses) * 10000) / 100,
    questions: totals.questions.map((distribution) => ({
      distribution,
      mean:
        Math.round((distribution.reduce((n, v, i) => n + v * (i + 1), 0) / responses) * 100) / 100,
    })),
  };
}
export interface SurveyView extends SurveyInput {
  id: string;
  company: Ref;
  status: 'draft' | 'open' | 'closed';
  eligible: boolean;
  submitted: boolean;
  manage: boolean;
  results: SurveyResults | null;
}
export const RECOGNITION_VALUES = ['teamwork', 'service', 'quality', 'initiative'] as const;
export const recognitionSchema = z.object({
  employeeCode: z.string().trim().min(1).max(40),
  value: z.enum(RECOGNITION_VALUES),
  message: z.string().trim().min(2).max(1000),
});
export type RecognitionInput = z.infer<typeof recognitionSchema>;
export interface RecognitionView {
  id: string;
  company: Ref;
  sender: EmployeeRef;
  recipient: EmployeeRef;
  value: (typeof RECOGNITION_VALUES)[number];
  message: string;
  createdAt: string;
  canHide: boolean;
}
export const announcementSchema = z
  .object({
    legalEntityId: z.uuid(),
    title,
    titleBn: title,
    body: content,
    bodyBn: content,
    requiresAcknowledgement: z.boolean().default(false),
    dueOn: z.iso.date().nullable().default(null),
    expiresOn: z.iso.date().nullable().default(null),
  })
  .refine((v) => !v.requiresAcknowledgement || !!v.dueOn, {
    path: ['dueOn'],
    message: 'Policy notices need an acknowledgement due date',
  })
  .refine((v) => !v.expiresOn || !v.dueOn || v.expiresOn >= v.dueOn, {
    path: ['expiresOn'],
    message: 'Expiry cannot be before the acknowledgement date',
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;
export interface AnnouncementView extends AnnouncementInput {
  id: string;
  company: Ref;
  status: 'draft' | 'published' | 'retired';
  expired: boolean;
  acknowledgedAt: string | null;
  canAcknowledge: boolean;
  manage: boolean;
  receipts: { employee: EmployeeRef; acknowledgedAt: string | null }[] | null;
}
export interface EngagementMe {
  employee: EmployeeRef | null;
  manage: boolean;
  surveys: SurveyView[];
  announcements: AnnouncementView[];
  recognition: RecognitionView[];
}

export const HR_REQUEST_CATEGORIES = ['letters', 'pay', 'leave', 'benefits', 'other'] as const;
export const HR_REQUEST_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const hrRequestSchema = z.object({
  category: z.enum(HR_REQUEST_CATEGORIES),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  subject: title,
  body: content,
});
export type HrRequestInput = z.infer<typeof hrRequestSchema>;
export const hrReplySchema = z.object({ body: content, internal: z.boolean().default(false) });
export const hrRequestUpdateSchema = z
  .object({
    status: z.enum(HR_REQUEST_STATUSES).optional(),
    assigneeId: z.uuid().nullable().optional(),
    reason: reasonSchema,
  })
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined, {
    message: 'Choose a status or assignee',
  });
export type HrRequestUpdateInput = z.infer<typeof hrRequestUpdateSchema>;
export interface HrRequestView {
  id: string;
  employee: EmployeeRef;
  company: Ref;
  subject: string;
  category: (typeof HR_REQUEST_CATEGORIES)[number];
  priority: 'normal' | 'urgent';
  status: (typeof HR_REQUEST_STATUSES)[number];
  assignee: Ref | null;
  createdAt: string;
  updatedAt: string;
  manage: boolean;
  messages: {
    id: string;
    authorName: string;
    body: string;
    internal: boolean;
    createdAt: string;
  }[];
}
export const ASSET_KINDS = ['laptop', 'phone', 'id_card', 'vehicle', 'equipment', 'other'] as const;
export const assetSchema = z.object({
  legalEntityId: z.uuid(),
  tag: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,40}$/),
  name: title,
  nameBn: title,
  kind: z.enum(ASSET_KINDS),
  serialNumber: z.string().trim().max(160).default(''),
});
export type AssetInput = z.infer<typeof assetSchema>;
export const assetIssueSchema = z
  .object({
    employeeCode: z.string().trim().min(1).max(40),
    issuedOn: z.iso.date(),
    dueOn: z.iso.date().nullable().default(null),
    condition: z.string().trim().min(2).max(2000),
  })
  .refine((v) => !v.dueOn || v.dueOn >= v.issuedOn, {
    path: ['dueOn'],
    message: 'Due date cannot precede issue',
  });
export type AssetIssueInput = z.infer<typeof assetIssueSchema>;
export const assetReturnSchema = z.object({
  returnedOn: z.iso.date(),
  condition: z.string().trim().min(2).max(2000),
});
export type AssetReturnInput = z.infer<typeof assetReturnSchema>;
export interface AssetIssueView {
  id: string;
  asset: {
    id: string;
    tag: string;
    name: string;
    nameBn: string;
    kind: (typeof ASSET_KINDS)[number];
    serialNumber: string;
  };
  employee: EmployeeRef;
  company: Ref;
  issuedOn: string;
  dueOn: string | null;
  issueCondition: string;
  returnedOn: string | null;
  returnCondition: string | null;
  acknowledgedAt: string | null;
  overdue: boolean;
  canAcknowledge: boolean;
}
export interface AssetView extends AssetInput {
  id: string;
  company: Ref;
  retiredAt: string | null;
  issues: AssetIssueView[];
}
export interface EmployeeServicesMe {
  employee: EmployeeRef | null;
  manage: boolean;
  requests: HrRequestView[];
  issues: AssetIssueView[];
}
