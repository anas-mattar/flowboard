import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { cardTable } from './card.js';
import { createdAtColumn } from './columns.js';
import { labelTable } from './label.js';

/** `card_label` (FS §5). The `label_id` index serves the board label filter (C-14). */
export const cardLabelTable = pgTable(
  'card_label',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => cardTable.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labelTable.id, { onDelete: 'cascade' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.labelId] }),
    index('card_label_label_idx').on(table.labelId),
  ],
);

export type CardLabelRow = typeof cardLabelTable.$inferSelect;
export type NewCardLabelRow = typeof cardLabelTable.$inferInsert;
