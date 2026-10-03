import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { idColumn, timestampColumns } from './columns.js';
import { userTable } from './user.js';

/**
 * `session` (CL-E5, CL-E9): backs both the httpOnly cookie session used by the
 * web app and the bearer token used by API clients. Only the token hash is
 * stored, never the token (FS §8). Sessions are issued in FB-02.
 */
export const sessionTable = pgTable(
  'session',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    ...timestampColumns(),
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export type SessionRow = typeof sessionTable.$inferSelect;
export type NewSessionRow = typeof sessionTable.$inferInsert;
