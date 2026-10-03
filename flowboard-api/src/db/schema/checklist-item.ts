import { boolean, doublePrecision, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { cardTable } from './card.js';
import { idColumn, timestampColumns } from './columns.js';

/** `checklist_item` (C-09). Ordered by a sparse float like lists and cards. */
export const checklistItemTable = pgTable(
  'checklist_item',
  {
    id: idColumn(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cardTable.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    position: doublePrecision('position').notNull(),
    ...timestampColumns(),
  },
  (table) => [index('checklist_item_card_position_idx').on(table.cardId, table.position)],
);

export type ChecklistItemRow = typeof checklistItemTable.$inferSelect;
export type NewChecklistItemRow = typeof checklistItemTable.$inferInsert;
