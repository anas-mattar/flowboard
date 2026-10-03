import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { archivedAtColumn, idColumn, timestampColumns } from './columns.js';
import { userTable } from './user.js';
import { workspaceTable } from './workspace.js';

/**
 * `board` (FS §5). `archived_at` replaces the boolean `archived` (CL-A2), and
 * `starred` is per user so it lives in `board_star` (CL-E14).
 */
export const boardTable = pgTable(
  'board',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaceTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    archivedAt: archivedAtColumn(),
    createdBy: uuid('created_by').references(() => userTable.id),
    ...timestampColumns(),
  },
  (table) => [
    // The sidebar lists live boards for one workspace (B-01).
    index('board_workspace_active_idx')
      .on(table.workspaceId)
      .where(sql`${table.archivedAt} is null`),
    check('board_name_length_check', sql`char_length(${table.name}) between 1 and 120`),
  ],
);

export type BoardRow = typeof boardTable.$inferSelect;
export type NewBoardRow = typeof boardTable.$inferInsert;
