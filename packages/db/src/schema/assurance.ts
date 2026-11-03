import { pgTable, uuid, text, integer, timestamp, unique, foreignKey } from 'drizzle-orm/pg-core';
import { platformUsers } from './platform.js';
export const assurancePrograms = pgTable('assurance_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  definitionEnc: text('definition_enc').notNull(),
  definitionHash: text('definition_hash').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const assuranceEvents = pgTable(
  'assurance_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id').notNull(),
    sequence: integer('sequence').notNull(),
    kind: text('kind').notNull(),
    payloadEnc: text('payload_enc').notNull(),
    payloadHash: text('payload_hash').notNull(),
    previousHash: text('previous_hash').notNull(),
    eventHash: text('event_hash').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => platformUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('assurance_event_sequence_uq').on(t.programId, t.sequence),
    foreignKey({ columns: [t.programId], foreignColumns: [assurancePrograms.id] }),
  ],
);
