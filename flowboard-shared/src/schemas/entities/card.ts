import { z } from 'zod';
import { archivedAtSchema, isoTimestampSchema, positionSchema, uuidSchema } from './common.js';

/**
 * A card (FS §5). Description, checklist items, comments and activity are
 * fetched separately when the card modal opens (ARCHITECTURE §2.3), so they
 * are not part of this shape.
 */
export const cardSchema = z
  .object({
    id: uuidSchema,
    listId: uuidSchema,
    title: z.string().min(1).max(500),
    position: positionSchema,
    dueAt: isoTimestampSchema.nullable(),
    dueComplete: z.boolean(),
    archivedAt: archivedAtSchema,
    createdBy: uuidSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .describe('Card');

export type Card = z.infer<typeof cardSchema>;
