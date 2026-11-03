import { z } from 'zod';
import { WORKFORCE_METRICS, WORKFORCE_VERSION } from './analytics.js';
import { insightDefinitionSchema, INSIGHT_VERSION } from './insights.js';

export const ASSISTANT_VERSION = 'assistant.v1';
export const ASSISTANT_QUERY_LIMIT = 200;
export const ASSISTANT_ACTOR_LIMIT = 20;
export const ASSISTANT_TENANT_LIMIT = 120;
export const ASSISTANT_WINDOW_MS = 60_000;

export const helpQuestionSchema = z
  .object({
    kind: z.literal('help'),
    question: z.string().trim().min(2).max(ASSISTANT_QUERY_LIMIT),
  })
  .strict();

export const workforceExplanationSchema = z
  .object({
    kind: z.literal('workforce'),
    asOf: z.iso.date(),
    companyId: z
      .uuid()
      .transform((id) => id.toLowerCase())
      .optional(),
  })
  .strict();

export const insightExplanationSchema = z
  .object({
    kind: z.literal('insight'),
    report: insightDefinitionSchema,
  })
  .strict();

export const assistantMetricSchema = z.discriminatedUnion('kind', [
  workforceExplanationSchema,
  insightExplanationSchema,
]);
export const assistantRequestSchema = z.union([helpQuestionSchema, assistantMetricSchema]);
export type AssistantMetric = z.infer<typeof assistantMetricSchema>;

const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const assistantCitationSchema = z.union([
  z
    .object({
      kind: z.literal('document'),
      id: z
        .string()
        .regex(/^(help|policy):[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(80),
      locale: z.enum(['en', 'bn', 'ar']),
      passage: z.number().int().min(0).max(200),
      revision,
    })
    .strict(),
  z.object({ kind: z.literal('metric'), request: assistantMetricSchema, revision }).strict(),
]);
export type AssistantCitation = z.infer<typeof assistantCitationSchema>;

export const assistantAdmissionSchema = z.object({ tenantId: z.uuid(), actorId: z.uuid() });
export type AssistantAdmission = z.infer<typeof assistantAdmissionSchema>;

const snapshot = { dataAsOf: z.iso.datetime(), sourceRevision: revision };
export const assistantWorkforceResultSchema = z.object({
  ...snapshot,
  version: z.literal(WORKFORCE_VERSION),
  asOf: z.iso.date(),
  period: z.object({ from: z.iso.date(), through: z.iso.date() }),
  scope: z.enum(['companies', 'relationship']),
  metrics: z
    .array(
      z.object({
        id: z.enum(WORKFORCE_METRICS),
        value: z.number().int().nonnegative().nullable(),
        state: z.enum(['current', 'provisional', 'incomplete', 'unavailable']),
      }),
    )
    .length(3)
    .refine((metrics) => new Set(metrics.map((metric) => metric.id)).size === 3),
  companies: z.array(z.object({ id: z.uuid(), name: z.string().max(300) })).max(50),
});

const amount = z
  .string()
  .max(40)
  .regex(/^-?\d+(?:\.\d+)?$/);
export const assistantInsightResultSchema = z.object({
  ...snapshot,
  version: z.literal(INSIGHT_VERSION),
  definition: insightDefinitionSchema,
  points: z
    .array(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .nullable(),
        state: z.enum(['recorded', 'provisional', 'incomplete', 'unavailable', 'suppressed']),
        issue: z
          .enum(['context', 'coverage', 'reconciliation', 'cohort', 'no_locked_runs'])
          .optional(),
        values: z.object({
          worked_days: amount.optional(),
          worked_minutes: amount.optional(),
          net_leave_days: amount.optional(),
          assigned: amount.optional(),
          completed: amount.optional(),
          employer_cost: amount.optional(),
        }),
      }),
    )
    .max(6),
});

const company = z.object({ id: z.uuid(), name: z.string().max(300) });
export const assistantWorkforceCatalogSchema = z.object({
  defaultAsOf: z.iso.date(),
  maxAsOf: z.iso.date(),
  companies: z.array(company).max(50),
});
export const assistantInsightCatalogSchema = z.object({
  latestMonth: z.string().regex(/^\d{4}-\d{2}$/),
  payroll: z.boolean(),
  companies: z
    .array(
      company.extend({
        kinds: z.array(z.enum(['attendance', 'leave', 'learning'])).max(3),
      }),
    )
    .max(50),
});
export type AssistantWorkforceCatalog = z.infer<typeof assistantWorkforceCatalogSchema>;
export type AssistantInsightCatalog = z.infer<typeof assistantInsightCatalogSchema>;
