import { WORKSPACE_ROLES } from '@flowboard/shared';
import { check, index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { inList, timestampColumns } from './columns.js';
import { userTable } from './user.js';
import { workspaceTable } from './workspace.js';

/**
 * `workspace_member` (CL-D7, FS §6). Many-to-many from day one, with a
 * composite primary key and `role` constrained to `admin | member`.
 */
export const workspaceMemberTable = pgTable(
  'workspace_member',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaceTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    ...timestampColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    // `GET /v1/me` lists a user's workspaces, so the non-leading column is indexed.
    index('workspace_member_user_idx').on(table.userId),
    check('workspace_member_role_check', inList(table.role, WORKSPACE_ROLES)),
  ],
);

export type WorkspaceMemberRow = typeof workspaceMemberTable.$inferSelect;
export type NewWorkspaceMemberRow = typeof workspaceMemberTable.$inferInsert;
