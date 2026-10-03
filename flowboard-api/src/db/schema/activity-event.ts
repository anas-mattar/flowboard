import { ACTIVITY_EVENT_TYPES } from '@flowboard/shared';
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { cardTable } from './card.js';
import { createdAtColumn, idColumn, inList } from './columns.js';
import { userTable } from './user.js';

/**
 * `activity_event` (FS §5.2). Append-only and never edited — it is the audit
 * trail (STANDARDS §1.3), so there is no `updated_at` (CL-E19) and no
 * repository method that updates or deletes a row.
 *
 * `type` is constrained by a CHECK built from the single `ACTIVITY_EVENT_TYPES`
 * enum in `flowboard-shared`, so the database and the broadcast schema cannot
 * drift (STANDARDS §1.2). A database role without `UPDATE`/`DELETE` enforces
 * append-only in production (FB-20).
 */
export const activityEventTable = pgTable(
  'activity_event',
  {
    id: idColumn(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cardTable.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => userTable.id),
    type: text('type').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('activity_event_card_created_idx').on(table.cardId, table.createdAt.desc()),
    check('activity_event_type_check', inList(table.type, ACTIVITY_EVENT_TYPES)),
  ],
);

export type ActivityEventRow = typeof activityEventTable.$inferSelect;
export type NewActivityEventRow = typeof activityEventTable.$inferInsert;
