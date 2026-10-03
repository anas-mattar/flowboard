import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAtColumn, idColumn, timestampColumns } from './columns.js';
import { listTable } from './list.js';
import { userTable } from './user.js';

/**
 * `card` (FS §5). The partial index on live cards serves both board hydration
 * and the per-list counts behind the WIP pill (ARCHITECTURE §2.3, FS §8).
 */
export const cardTable = pgTable(
  'card',
  {
    id: idColumn(),
    listId: uuid('list_id')
      .notNull()
      .references(() => listTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    position: doublePrecision('position').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    dueComplete: boolean('due_complete').notNull().default(false),
    archivedAt: archivedAtColumn(),
    createdBy: uuid('created_by').references(() => userTable.id),
    ...timestampColumns(),
  },
  (table) => [
    index('card_list_active_idx')
      .on(table.listId, table.position)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export type CardRow = typeof cardTable.$inferSelect;
export type NewCardRow = typeof cardTable.$inferInsert;
