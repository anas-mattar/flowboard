import { z } from 'zod';
import { workspacePlanSchema } from '../roles.js';
import { isoTimestampSchema, uuidSchema } from './common.js';

/**
 * A workspace (FS §5). `plan` and the limit columns are stored configuration
 * only and are never enforced in MVP (CL-D5), so they are not part of the
 * public shape fixed by FB-01 §6.
 */
export const workspaceSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(120),
    plan: workspacePlanSchema,
    createdAt: isoTimestampSchema,
  })
  .describe('Workspace');

export type Workspace = z.infer<typeof workspaceSchema>;
