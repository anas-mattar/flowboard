import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { boardTable } from './board.js';
import { createdAtColumn } from './columns.js';
import { userTable } from './user.js';

/**
 * `board_star` (CL-E14): starring is a personal preference (B-04), so it is a
 * per-user row rather than a column on `board`.
 */
export const boardStarTable = pgTable(
  'board_star',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boardTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    index('board_star_user_idx').on(table.userId),
  ],
);

export type BoardStarRow = typeof boardStarTable.$inferSelect;
export type NewBoardStarRow = typeof boardStarTable.$inferInsert;
