import { z } from 'zod';
import { boardRoleSchema } from '../roles.js';
import { archivedAtSchema, hexColorSchema, isoTimestampSchema, uuidSchema } from './common.js';
import { publicUserSchema } from './user.js';

/**
 * A board (FS §5). `starred` is per user and lives in `board_star` (CL-E14),
 * so it is not a column here; FB-04 adds it to the board list response.
 */
export const boardSchema = z
  .object({
    id: uuidSchema,
    workspaceId: uuidSchema,
    name: z.string().min(1).max(120),
    color: hexColorSchema,
    archivedAt: archivedAtSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .describe('Board');

export type Board = z.infer<typeof boardSchema>;

/** A board membership with the member's public profile (FS §6). */
export const boardMemberSchema = z
  .object({
    boardId: uuidSchema,
    role: boardRoleSchema,
    user: publicUserSchema,
  })
  .describe('BoardMember');

export type BoardMember = z.infer<typeof boardMemberSchema>;
