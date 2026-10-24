import { HOLIDAY_KINDS } from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';

export const holidayKind = pgEnum('holiday_kind', HOLIDAY_KINDS);

/** A set of holidays; each location uses one, or the workspace default. */
export const holidayCalendars = pgTable(
  'holiday_calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('holiday_calendars_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('holiday_calendars_default_uq')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
  ],
);

export const holidays = pgTable(
  'holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    kind: holidayKind('kind').notNull(),
    /** A lunar date awaiting the moon-sighting announcement. */
    isTentative: boolean('is_tentative').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('holidays_calendar_date_uq').on(t.calendarId, t.date),
    index('holidays_tenant_date_idx').on(t.tenantId, t.date),
    foreignKey({
      name: 'holidays_calendar_fk',
      columns: [t.tenantId, t.calendarId],
      foreignColumns: [holidayCalendars.tenantId, holidayCalendars.id],
    }).onDelete('cascade'),
  ],
);
