import { FUNNEL_EVENT_TYPES } from '@flowboard/shared';
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, inList } from './columns.js';
import { userTable } from './user.js';
import { workspaceTable } from './workspace.js';

/**
 * `funnel_event` (BM §9, §13.3): funnel instrumentation ships with v1.0 and is
 * stored in our own database rather than a third-party analytics service.
 *
 * `workspace_id` and `user_id` are nullable because the first event of the
 * funnel (`user.signed_up`) is recorded before either exists. Append-only, so
 * there is no `updated_at` (CL-E19). Emitted from FB-18.
 */
export const funnelEventTable = pgTable(
  'funnel_event',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id').references(() => workspaceTable.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id').references(() => userTable.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('funnel_event_workspace_type_created_idx').on(
      table.workspaceId,
      table.type,
      table.createdAt,
    ),
    check('funnel_event_type_check', inList(table.type, FUNNEL_EVENT_TYPES)),
  ],
);

export type FunnelEventRow = typeof funnelEventTable.$inferSelect;
export type NewFunnelEventRow = typeof funnelEventTable.$inferInsert;
