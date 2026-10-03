import { BOARD_ROLES } from '@flowboard/shared';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boardTable } from './board.js';
import { idColumn, inList, timestampColumns } from './columns.js';
import { userTable } from './user.js';

/**
 * `invitation` (CL-D6): link-based board invitations. Only the hash of the
 * token is stored, never the token itself (FS §8). Used from FB-09.
 */
export const invitationTable = pgTable(
  'invitation',
  {
    id: idColumn(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boardTable.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').notNull(),
    invitedBy: uuid('invited_by').references(() => userTable.id),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    ...timestampColumns(),
  },
  (table) => [
    index('invitation_board_idx').on(table.boardId),
    check('invitation_role_check', inList(table.role, BOARD_ROLES)),
  ],
);

export type InvitationRow = typeof invitationTable.$inferSelect;
export type NewInvitationRow = typeof invitationTable.$inferInsert;
