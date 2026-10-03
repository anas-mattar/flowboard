import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { idColumn, timestampColumns } from './columns.js';
import { userTable } from './user.js';

/**
 * `workspace` (FS §5). `plan` and the limit columns are stored configuration
 * only and are never enforced in MVP (CL-D5); the defaults are the BM §4.2
 * Free-plan values.
 */
export const workspaceTable = pgTable('workspace', {
  id: idColumn(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'),
  seats: integer('seats'),
  boardLimit: integer('board_limit').default(3),
  userLimit: integer('user_limit').default(10),
  cardLimit: integer('card_limit').default(500),
  createdBy: uuid('created_by').references(() => userTable.id),
  ...timestampColumns(),
});

export type WorkspaceRow = typeof workspaceTable.$inferSelect;
export type NewWorkspaceRow = typeof workspaceTable.$inferInsert;
