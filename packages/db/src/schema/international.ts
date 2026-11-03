import {
  pgTable,
  uuid,
  text,
  date,
  jsonb,
  timestamp,
  unique,
  foreignKey,
  numeric,
  boolean,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';
import { legalEntities } from './tenant.js';
import { employees } from './hr.js';
const tid = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id);
const at = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const companyLegalProfiles = pgTable(
  'company_legal_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    countryCode: text('country_code').notNull(),
    regime: text('regime').notNull(),
    currency: text('currency').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    effectiveTo: date('effective_to', { mode: 'string' }),
    businessTimeZone: text('business_time_zone').notNull(),
    calendar: text('calendar').notNull().default('gregorian'),
    registrations: jsonb('registrations').$type<Record<string, string>>().notNull().default({}),
    reviewStatus: text('review_status').notNull().default('needs_review'),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by'),
    createdAt: at(),
  },
  (t) => [
    unique('company_profile_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
  ],
);
export const employmentStatutoryProfiles = pgTable(
  'employment_statutory_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    employeeId: uuid('employee_id').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    effectiveTo: date('effective_to', { mode: 'string' }),
    citizenship: text('citizenship').notNull(),
    insuranceClass: text('insurance_class').notNull(),
    contractClass: text('contract_class').notNull(),
    originalName: text('original_name').notNull(),
    translatedName: text('translated_name'),
    suppliedHijriDate: text('supplied_hijri_date'),
    calendarProvenance: text('calendar_provenance'),
    reason: text('reason').notNull(),
    createdAt: at(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);
export const employeeIdentifiers = pgTable(
  'employee_identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    employeeId: uuid('employee_id').notNull(),
    kind: text('kind').notNull(),
    issuer: text('issuer').notNull(),
    valueEnc: text('value_enc').notNull(),
    last4: text('last4').notNull(),
    validFrom: date('valid_from', { mode: 'string' }),
    validTo: date('valid_to', { mode: 'string' }),
    createdAt: at(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);
export const commercialPrices = pgTable(
  'commercial_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planCode: text('plan_code').notNull(),
    currency: text('currency').notNull(),
    seatPrice: numeric('seat_price', { precision: 14, scale: 2 }).notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    merchantProduct: text('merchant_product').notNull(),
    merchantPrice: text('merchant_price').notNull(),
    reason: text('reason').notNull(),
    createdAt: at(),
  },
  (t) => [unique('commercial_price_effective_uq').on(t.planCode, t.currency, t.effectiveFrom)],
);
export const merchantLedger = pgTable(
  'merchant_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    kind: text('kind').notNull(),
    currency: text('currency').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    externalInvoice: text('external_invoice').notNull(),
    externalReference: text('external_reference').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    payloadHash: text('payload_hash').notNull(),
    reconciled: boolean('reconciled').notNull().default(false),
    createdAt: at(),
  },
  (t) => [unique('merchant_event_uq').on(t.provider, t.eventId)],
);
