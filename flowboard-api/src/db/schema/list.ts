import { sql } from 'drizzle-orm';
import { check, doublePrecision, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { boardTable } from './board.js';
import { archivedAtColumn, idColumn, timestampColumns } from './columns.js';

/**
 * `list` (FS §5). `position` is a sparse float (FS §5.1); `wip_limit` is
 * nullable, meaning "no limit" (L-04, CL-D4).
 */
export const listTable = pgTable(
  'list',
  {
    id: idColumn(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boardTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: doublePrecision('position').notNull(),
    wipLimit: integer('wip_limit'),
    archivedAt: archivedAtColumn(),
    ...timestampColumns(),
  },
  (table) => [
    index('list_board_position_idx').on(table.boardId, table.position),
    check('list_wip_limit_check', sql`${table.wipLimit} is null or ${table.wipLimit} > 0`),
  ],
);

export type ListRow = typeof listTable.$inferSelect;
export type NewListRow = typeof listTable.$inferInsert;
