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
    // FB-06 §7: the feed is ordered `(created_at desc, id desc)` and paginated
    // on that whole tuple (CL-E38), so `id` is part of the index. Without it a
    // card with 1,000 events sorts its entire history to return one page of 50.
    //
    // `nullsFirst()` is not cosmetic: plain `ORDER BY x DESC` means `DESC NULLS
    // FIRST` in SQL, and an index declared `DESC NULLS LAST` does not satisfy
    // it — PostgreSQL falls back to a bitmap scan plus a top-N sort over the
    // card's whole history. Both columns are `not null`, so the two spellings
    // are semantically identical and only the planner can tell them apart.
    index('activity_event_card_created_idx').on(
      table.cardId,
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    check('activity_event_type_check', inList(table.type, ACTIVITY_EVENT_TYPES)),
  ],
);

export type ActivityEventRow = typeof activityEventTable.$inferSelect;
export type NewActivityEventRow = typeof activityEventTable.$inferInsert;
