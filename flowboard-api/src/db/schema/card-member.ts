import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { cardTable } from './card.js';
import { createdAtColumn } from './columns.js';
import { userTable } from './user.js';

/** `card_member` (FS §5). The `user_id` index serves the member filter (C-14). */
export const cardMemberTable = pgTable(
  'card_member',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cardTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.userId] }),
    index('card_member_user_idx').on(table.userId),
  ],
);

export type CardMemberRow = typeof cardMemberTable.$inferSelect;
export type NewCardMemberRow = typeof cardMemberTable.$inferInsert;
