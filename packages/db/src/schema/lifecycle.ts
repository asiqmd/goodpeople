import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SOURCES,
  IMPORT_STATUSES,
  LETTER_LANGUAGES,
  SEPARATION_STATUSES,
  SEPARATION_TYPES,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { employees } from './hr.js';
import { tenants } from './platform.js';

export const documentCategory = pgEnum('document_category', DOCUMENT_CATEGORIES);
export const documentSource = pgEnum('document_source', DOCUMENT_SOURCES);
export const separationType = pgEnum('separation_type', SEPARATION_TYPES);
export const separationStatus = pgEnum('separation_status', SEPARATION_STATUSES);
export const letterLanguage = pgEnum('letter_language', LETTER_LANGUAGES);
export const importStatus = pgEnum('import_status', IMPORT_STATUSES);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const instant = (name: string) => timestamp(name, { withTimezone: true });
const isoDate = (name: string) => date(name, { mode: 'string' });

/**
 * An employee's file in the vault. The file itself is in the file store, encrypted for its
 * workspace; deleting a document removes the file and keeps this row for the record.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    category: documentCategory('category').notNull(),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    source: documentSource('source').notNull().default('upload'),
    /** A generated letter's reference number. */
    refNo: text('ref_no'),
    letterTemplateId: uuid('letter_template_id'),
    issuedOn: isoDate('issued_on'),
    expiresOn: isoDate('expires_on'),
    visibleToEmployee: boolean('visible_to_employee').notNull().default(false),
    uploadedBy: uuid('uploaded_by'),
    createdAt: createdAt(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by'),
  },
  (t) => [
    unique('documents_tenant_id_uq').on(t.tenantId, t.id),
    index('documents_employee_idx').on(t.tenantId, t.employeeId, t.category),
    index('documents_expiry_idx')
      .on(t.tenantId, t.expiresOn)
      .where(sql`${t.expiresOn} is not null and ${t.deletedAt} is null`),
    foreignKey({
      name: 'documents_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
  ],
);

/**
 * How someone's employment ends. Approval steps (subject "separation") decide employee
 * resignations; HR's own records stand approved. A background run completes it after the
 * last working day.
 */
export const separations = pgTable(
  'separations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    type: separationType('type').notNull(),
    status: separationStatus('status').notNull(),
    noticeDate: isoDate('notice_date').notNull(),
    lastWorkingDay: isoDate('last_working_day').notNull(),
    reason: text('reason').notNull(),
    noticeDaysRequired: integer('notice_days_required'),
    initiatedBy: text('initiated_by').$type<'employee' | 'hr'>().notNull(),
    appliedBy: uuid('applied_by').notNull(),
    createdAt: createdAt(),
    decidedAt: instant('decided_at'),
    completedAt: instant('completed_at'),
    cancelledAt: instant('cancelled_at'),
  },
  (t) => [
    unique('separations_tenant_id_uq').on(t.tenantId, t.id),
    // One separation in progress per person.
    uniqueIndex('separations_open_uq')
      .on(t.employeeId)
      .where(sql`${t.status} in ('pending', 'approved')`),
    foreignKey({
      name: 'separations_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
  ],
);

/** A workspace's letter text, one per kind and language, starting from the country pack's. */
export const letterTemplates = pgTable(
  'letter_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    language: letterLanguage('language').notNull(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    updatedBy: uuid('updated_by'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('letter_templates_tenant_id_uq').on(t.tenantId, t.id),
    unique('letter_templates_code_language_uq').on(t.tenantId, t.code, t.language),
  ],
);

/** Running numbers, such as letter references per legal entity and year. */
export const documentCounters = pgTable(
  'document_counters',
  {
    tenantId: tenantId(),
    key: text('key').notNull(),
    year: integer('year').notNull(),
    value: integer('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key, t.year] })],
);

/**
 * An uploaded spreadsheet, checked and waiting to be committed. The rows hold identity
 * numbers, so they are kept encrypted and dropped when the batch is committed or expires.
 */
export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    kind: text('kind').$type<'employees'>().notNull(),
    fileName: text('file_name').notNull(),
    status: importStatus('status').notNull().default('validated'),
    totalRows: integer('total_rows').notNull(),
    validRows: integer('valid_rows').notNull(),
    rowsEnc: text('rows_enc'),
    report: jsonb('report').notNull(),
    imported: integer('imported'),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
    committedAt: instant('committed_at'),
    expiresAt: instant('expires_at').notNull(),
  },
  (t) => [index('import_batches_tenant_idx').on(t.tenantId, t.createdAt)],
);
