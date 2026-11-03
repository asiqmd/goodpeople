// Phase 4 M1 recruitment: offers (input schemas and views).

import { z } from 'zod';
import type { HireResult } from './hr-types.js';
import { hireFieldsSchema } from './hr-schemas.js';
import {
  EMPLOYMENT_TYPES,
  WORKER_CATEGORIES,
  type EmploymentType,
  type WorkerCategory,
} from './hr.js';
import type { ApprovalStepKind } from './leave.js';
import type { ApprovalStepView } from './leave-types.js';
import type { PayBasis } from './payroll.js';
import { moneySchema } from './payroll-schemas.js';
import type { PayRecordView } from './payroll-types.js';
import type { ApplicationStage, OfferStatus, OpeningStatus } from './recruitment.js';

export const OFFER_LANGUAGES = ['en', 'bn'] as const;
export type OfferLanguage = (typeof OFFER_LANGUAGES)[number];

/** Offers still in play; an application has at most one. */
export const LIVE_OFFER_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'sent',
  'accepted',
] as const satisfies readonly OfferStatus[];

/** HR may still change the terms; a change puts the offer back to draft. */
export const OFFER_EDITABLE_STATUSES = [
  'draft',
  'approved',
  'rejected',
] as const satisfies readonly OfferStatus[];

/** Every live offer but an accepted one can be withdrawn. */
export const OFFER_WITHDRAWABLE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'sent',
] as const satisfies readonly OfferStatus[];

export const OFFER_TERMS_MAX = 5000;
export const OFFER_DECLINE_REASON_MAX = 1000;

const optionalId = z.uuid().nullable().optional();

/** An offer's terms, as HR drafts or changes them. */
export const offerFieldsSchema = z.object({
  legalEntityId: z.uuid(),
  orgUnitId: optionalId,
  locationId: optionalId,
  designationId: optionalId,
  gradeId: optionalId,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  joiningOn: z.iso.date(),
  monthlyGross: moneySchema.refine((v) => Number(v) > 0, 'Enter the monthly gross pay'),
  /** Probationers only; at most the Labour Act's period (s.4), which is also the default. */
  probationMonths: z.number().int().min(1).max(12).nullable().optional(),
  /** The last day the candidate can accept. */
  expiresOn: z.iso.date(),
  /** The letter's language. */
  language: z.enum(OFFER_LANGUAGES).default('en'),
  terms: z.string().trim().max(OFFER_TERMS_MAX).nullable().optional(),
});

const expiresByJoining = (
  offer: { joiningOn: string; expiresOn: string },
  ctx: z.RefinementCtx,
) => {
  if (offer.expiresOn > offer.joiningOn) {
    ctx.addIssue({
      code: 'custom',
      message: 'The offer must expire on or before the joining date',
      path: ['expiresOn'],
    });
  }
};

export const offerSchema = offerFieldsSchema
  .extend({ applicationId: z.uuid() })
  .superRefine(expiresByJoining);
export type OfferInput = z.infer<typeof offerSchema>;

/** The whole set of terms again (the form sends them all). */
export const offerUpdateSchema = offerFieldsSchema.superRefine(expiresByJoining);
export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>;

export const offerListQuerySchema = z.object({ applicationId: z.uuid() });

// ── The candidate's side ─────────────────────────────────────────────────────

/** Left empty by people; filled by simple bots. */
const honeypot = z.string().max(200).optional();

export const offerAcceptSchema = z.object({
  /** Their full name, typed: it must match the name on the offer. */
  name: z.string().trim().min(2, 'Type your full name').max(160),
  website: honeypot,
});
export type OfferAcceptInput = z.infer<typeof offerAcceptSchema>;

export const offerDeclineSchema = z.object({
  reason: z.string().trim().max(OFFER_DECLINE_REASON_MAX).optional(),
  website: honeypot,
});
export type OfferDeclineInput = z.infer<typeof offerDeclineSchema>;

const plainName = (s: string) => s.normalize('NFC').replace(/\s+/g, '').toLowerCase();

/** Spaces and case do not matter when the candidate types their name to accept. */
export const sameName = (typed: string, name: string) => plainName(typed) === plainName(name);

// ── Hiring from an accepted offer ────────────────────────────────────────────

// The offer gives the name, the joining date and the job; the request gives what it does not
// know, checked as any hire is.
const {
  fullName: _fullName,
  joinedOn: _joinedOn,
  probationEndsOn: _probationEndsOn,
  job: _job,
  mobilePhone,
  ...personFields
} = hireFieldsSchema.shape;

export const offerHireSchema = z.object({
  ...personFields,
  /** The candidate's mobile when left out. */
  mobilePhone: mobilePhone.optional(),
  job: z
    .object({
      /** The designation's category when left out. */
      workerCategory: z.enum(WORKER_CATEGORIES).optional(),
      managerId: z.uuid().optional(),
      costCentreId: z.uuid().optional(),
    })
    .default({}),
  /** Where the offered gross is proposed in payroll; without it pay is left for HR to set. */
  pay: z
    .object({
      structureId: z.uuid(),
      payGroupId: z.uuid(),
      wageGrade: z.string().trim().max(20).optional(),
    })
    .optional(),
});
export type OfferHireInput = z.infer<typeof offerHireSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

export interface OfferRef {
  id: string;
  name: string;
  nameBn: string | null;
}

export interface OfferView {
  id: string;
  applicationId: string;
  status: OfferStatus;
  candidate: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    language: OfferLanguage;
  };
  opening: {
    id: string;
    title: string;
    status: OpeningStatus;
    headcount: number;
    budgetMin: string | null;
    budgetMax: string | null;
  };
  legalEntity: OfferRef;
  orgUnit: OfferRef | null;
  location: OfferRef | null;
  designation: OfferRef | null;
  grade: OfferRef | null;
  employmentType: EmploymentType;
  joiningOn: string;
  monthlyGross: string;
  probationMonths: number | null;
  expiresOn: string;
  language: OfferLanguage;
  terms: string | null;
  /** Above the opening's budget: HR approves it before it is sent. */
  aboveBudget: boolean;
  sentAt: string | null;
  decidedAt: string | null;
  acceptedName: string | null;
  acceptedIp: string | null;
  declineReason: string | null;
  /** The SHA-256 of the letter as accepted. */
  letterSha256: string | null;
  /** The employee hired from it. */
  employeeId: string | null;
  createdBy: string | null;
  createdAt: string;
  steps: ApprovalStepView[];
}

/** What a new offer starts with, from the opening. */
export interface OfferDefaults {
  legalEntityId: string;
  orgUnitId: string | null;
  locationId: string | null;
  designationId: string | null;
  gradeId: string | null;
  employmentType: EmploymentType;
  language: OfferLanguage;
}

/** An application's offers, for its page. */
export interface ApplicationOffers {
  applicationId: string;
  stage: ApplicationStage;
  /** Newest first; the live one, if any, is first. */
  offers: OfferView[];
  /** Whether HR may draft a new offer (the application is open with no live offer). */
  canOffer: boolean;
  defaults: OfferDefaults;
  budgetMax: string | null;
  /** The Labour Act's probation in months (s.4): clerical work and other work. */
  probation: { clerical: number; other: number };
}

/** What the candidate sees through their link. */
export interface PublicOfferView {
  workspace: { name: string; slug: string };
  company: { name: string; address: { en: string; bn: string } | null };
  candidate: { fullName: string };
  position: { en: string; bn: string };
  orgUnit: { en: string; bn: string } | null;
  location: string | null;
  grade: string | null;
  employmentType: EmploymentType;
  joiningOn: string;
  monthlyGross: string;
  probationMonths: number | null;
  expiresOn: string;
  language: OfferLanguage;
  terms: string | null;
  /** `sent` until they decide; `expired` once the last day has passed. */
  status: Extract<OfferStatus, 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn'>;
  sentAt: string | null;
  decidedAt: string | null;
  acceptedName: string | null;
}

/** The hire form's starting point for an accepted offer. */
export interface OfferHirePrefill {
  offer: OfferView;
  /** Local form, e.g. 01712345678. */
  mobilePhone: string | null;
  email: string | null;
  workerCategory: WorkerCategory;
  probationEndsOn: string | null;
  /** Null when the workspace has no payroll. */
  payroll: {
    structures: {
      id: string;
      code: string;
      name: string;
      nameBn: string | null;
      basis: PayBasis;
      wageBoard: string | null;
    }[];
    payGroups: { id: string; code: string; name: string }[];
  } | null;
}

export interface OfferHireResult extends HireResult {
  /** The offered pay as proposed in payroll, waiting for its approval. */
  pay: PayRecordView | null;
  /** Why the pay was not proposed, when the workspace has payroll: HR sets it on the pay page. */
  payNote: { code: string; message: string } | null;
}

export interface OfferApprovalItem {
  subjectType: 'offer';
  stepId: string;
  kind: ApprovalStepKind;
  offer: OfferView;
}
