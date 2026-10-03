import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common.js';
import { publicUserSchema } from './user.js';

/** A comment on a card (C-10). Immutable in v1.0: no edit story exists. */
export const commentSchema = z
  .object({
    id: uuidSchema,
    cardId: uuidSchema,
    author: publicUserSchema,
    body: z.string().min(1).max(5000),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .describe('Comment');

export type Comment = z.infer<typeof commentSchema>;
