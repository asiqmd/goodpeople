import { z } from 'zod';
import { INDUSTRY_TEMPLATES, type IndustryTemplate } from './catalog.js';
import { slugSchema } from './schemas.js';

// Self-serve sign-up: a verified email address becomes a trial workspace.

/** How long a self-serve trial lasts, and the plan it tries. */
export const TRIAL_DAYS = 30;
export const TRIAL_PLAN = 'business' as const;
/** A sign-up code's lifetime and the wrong guesses it allows. */
export const SIGNUP_CODE_MINUTES = 15;
export const SIGNUP_CODE_ATTEMPTS = 5;

export const signupStartSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.email('Enter a work email address').max(200),
  company: z.string().trim().min(2, 'Enter the company name').max(160),
  industryTemplate: z.enum(INDUSTRY_TEMPLATES),
  language: z.enum(['en', 'bn']).default('en'),
  /** Left empty by people; filled by simple bots. */
  website: z.string().max(200).optional(),
});
export type SignupStartInput = z.infer<typeof signupStartSchema>;

export const signupVerifySchema = z.object({
  signupId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the six-digit code'),
  slug: slugSchema,
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});
export type SignupVerifyInput = z.infer<typeof signupVerifySchema>;

export const slugCheckSchema = z.object({ slug: z.string().trim().max(60) });

export interface SignupStarted {
  signupId: string;
  expiresInSeconds: number;
  /** A free workspace address made from the company name, to start from. */
  suggestedSlug: string;
}

export interface SlugCheck {
  slug: string;
  available: boolean;
  /** A free address near the one asked for, when it is taken or not allowed. */
  suggestion: string | null;
}

export type SignupStage = 'code_sent' | 'workspace_created' | 'expired';

/** A sign-up as the platform console lists it. */
export interface SignupView {
  id: string;
  name: string;
  email: string;
  company: string;
  industryTemplate: IndustryTemplate;
  stage: SignupStage;
  tenant: { id: string; slug: string } | null;
  createdAt: string;
}

/** Turns a company name into a workspace address: lowercase letters, digits and dashes. */
export function slugFrom(company: string): string {
  const base = company
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b(limited|ltd|plc|pvt|private|company|co|inc)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `${base || 'workspace'}-hr`.replace(/^-/, '');
}
