import { USER_THEMES } from '@flowboard/shared';
import { sql } from 'drizzle-orm';
import { check, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { idColumn, inList, timestampColumns } from './columns.js';

/**
 * `user` (FS §5, CL-E5, CL-E13).
 *
 * Only `password_hash` is stored — never the password (FS §8). Email is
 * compared case-insensitively, enforced by a unique index on `lower(email)`.
 */
export const userTable = pgTable(
  'user',
  {
    id: idColumn(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    initials: text('initials').notNull(),
    avatarColor: text('avatar_color').notNull(),
    theme: text('theme').notNull().default('system'),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex('user_email_lower_idx').on(sql`lower(${table.email})`),
    check('user_theme_check', inList(table.theme, USER_THEMES)),
  ],
);

export type UserRow = typeof userTable.$inferSelect;
export type NewUserRow = typeof userTable.$inferInsert;
