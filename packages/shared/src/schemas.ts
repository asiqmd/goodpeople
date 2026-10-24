import { z } from 'zod';
import {
  BILLING_MODES,
  COUNTRY_PACKS,
  FEATURE_KEYS,
  INDUSTRY_TEMPLATES,
  LIMIT_KEYS,
  PLAN_CODES,
} from './catalog.js';

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3–40 lowercase letters, digits or dashes');

/** Every platform write must say why. */
export const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Give a reason of at least 5 characters')
  .max(500);

const isoDateTime = z.iso.datetime({ offset: true });

export const tenantLoginSchema = z.object({
  tenant: slugSchema,
  email: z.email(),
  password: z.string().min(1),
});
export type TenantLoginInput = z.infer<typeof tenantLoginSchema>;

export const platformLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshInput = z.infer<typeof refreshSchema>;

const limitValue = z.number().int().positive().nullable();
export const limitOverridesSchema = z
  .object(
    Object.fromEntries(LIMIT_KEYS.map((k) => [k, limitValue.optional()])) as Record<
      (typeof LIMIT_KEYS)[number],
      z.ZodOptional<typeof limitValue>
    >,
  )
  .partial();

/** The Super Admin "Assign company" form: create a tenant and decide how it is billed. */
export const assignCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  countryPack: z.enum(COUNTRY_PACKS).default('BD'),
  industryTemplate: z.enum(INDUSTRY_TEMPLATES),
  billingMode: z.enum(BILLING_MODES),
  planCode: z.enum(PLAN_CODES),
  accessExpiresAt: isoDateTime.nullable().optional(),
  limits: limitOverridesSchema.optional(),
  reason: reasonSchema,
  admin: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email(),
    password: z.string().min(10).optional(),
  }),
});
export type AssignCompanyInput = z.infer<typeof assignCompanySchema>;

export const updateBillingSchema = z.object({
  billingMode: z.enum(BILLING_MODES),
  planCode: z.enum(PLAN_CODES).optional(),
  accessExpiresAt: isoDateTime.nullable().optional(),
  /** Replaces the tenant's limit overrides when present. */
  limits: limitOverridesSchema.optional(),
  reason: reasonSchema,
});
export type UpdateBillingInput = z.infer<typeof updateBillingSchema>;

export const createGrantSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('feature'),
    key: z.enum(FEATURE_KEYS),
    endsAt: isoDateTime.nullable().optional(),
    reason: reasonSchema,
  }),
  z.object({
    kind: z.literal('limit'),
    key: z.enum(LIMIT_KEYS),
    value: limitValue,
    endsAt: isoDateTime.nullable().optional(),
    reason: reasonSchema,
  }),
]);
export type CreateGrantInput = z.infer<typeof createGrantSchema>;
