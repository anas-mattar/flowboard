import { BOARD_ROLES } from '@flowboard/shared';
import { check, index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { boardTable } from './board.js';
import { inList, timestampColumns } from './columns.js';
import { userTable } from './user.js';

/** `board_member` (FS §6): `admin | member | observer`, composite key. */
export const boardMemberTable = pgTable(
  'board_member',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boardTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    ...timestampColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    index('board_member_user_idx').on(table.userId),
    check('board_member_role_check', inList(table.role, BOARD_ROLES)),
  ],
);

export type BoardMemberRow = typeof boardMemberTable.$inferSelect;
export type NewBoardMemberRow = typeof boardMemberTable.$inferInsert;
