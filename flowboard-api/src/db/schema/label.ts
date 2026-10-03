import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { boardTable } from './board.js';
import { idColumn, timestampColumns } from './columns.js';

/** `label` (CL-D3): board-scoped, six defaults per board, unique name per board. */
export const labelTable = pgTable(
  'label',
  {
    id: idColumn(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boardTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    ...timestampColumns(),
  },
  (table) => [uniqueIndex('label_board_name_idx').on(table.boardId, table.name)],
);

export type LabelRow = typeof labelTable.$inferSelect;
export type NewLabelRow = typeof labelTable.$inferInsert;
