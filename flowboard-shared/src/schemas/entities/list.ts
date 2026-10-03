import { z } from 'zod';
import { archivedAtSchema, isoTimestampSchema, positionSchema, uuidSchema } from './common.js';

/** A list on a board (FS §5). `wipLimit` is `null` when the list has no limit. */
export const listSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    name: z.string().min(1).max(120),
    position: positionSchema,
    wipLimit: z.number().int().positive().nullable(),
    archivedAt: archivedAtSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .describe('List');

export type List = z.infer<typeof listSchema>;
