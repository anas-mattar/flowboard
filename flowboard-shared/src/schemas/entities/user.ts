import { z } from 'zod';
import { userThemeSchema } from '../roles.js';
import { hexColorSchema, isoTimestampSchema, uuidSchema } from './common.js';

/**
 * The only user shape other members ever see (FB-01 §6). It never carries
 * `email` or `password_hash` (FS §8 security).
 */
export const publicUserSchema = z
  .object({
    id: uuidSchema,
    displayName: z.string().min(1).max(120),
    initials: z.string().min(1).max(4),
    avatarColor: hexColorSchema,
  })
  .describe('PublicUser');

export type PublicUser = z.infer<typeof publicUserSchema>;

/** The authenticated user's own record: `PublicUser` plus private fields. */
export const userSchema = publicUserSchema
  .extend({
    email: z.email(),
    theme: userThemeSchema,
    createdAt: isoTimestampSchema,
  })
  .describe('User');

export type User = z.infer<typeof userSchema>;
