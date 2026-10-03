import { z } from 'zod';
import { isoTimestampSchema, positionSchema, uuidSchema } from './common.js';

/** A checklist item on a card (C-09). Ordered by a sparse float (FS §5.1). */
export const checklistItemSchema = z
  .object({
    id: uuidSchema,
    cardId: uuidSchema,
    text: z.string().min(1).max(500),
    done: z.boolean(),
    position: positionSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .describe('ChecklistItem');

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
