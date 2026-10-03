import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { cardTable } from './card.js';
import { idColumn, timestampColumns } from './columns.js';
import { userTable } from './user.js';

/**
 * `comment` (C-10). Immutable in v1.0 — no edit story exists — but it keeps
 * `updated_at` so the generic table rules in STANDARDS §1.3 hold and a future
 * edit story needs no migration.
 */
export const commentTable = pgTable(
  'comment',
  {
    id: idColumn(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cardTable.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => userTable.id),
    body: text('body').notNull(),
    ...timestampColumns(),
  },
  (table) => [index('comment_card_created_idx').on(table.cardId, table.createdAt.desc())],
);

export type CommentRow = typeof commentTable.$inferSelect;
export type NewCommentRow = typeof commentTable.$inferInsert;
