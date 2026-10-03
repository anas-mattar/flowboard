import { z } from 'zod';
import { hexColorSchema, uuidSchema } from './common.js';

/** A board-scoped label (CL-D3). Six defaults are created with every board. */
export const labelSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    name: z.string().min(1).max(60),
    color: hexColorSchema,
  })
  .describe('Label');

export type Label = z.infer<typeof labelSchema>;
