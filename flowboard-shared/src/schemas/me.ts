import { z } from 'zod';
import { userThemeSchema, workspaceRoleSchema } from './roles.js';
import { userSchema } from './entities/user.js';
import { workspaceSchema } from './entities/workspace.js';

/**
 * `GET /v1/me` and `PATCH /v1/me` (FB-02 §6).
 *
 * The caller's workspaces are returned with the caller's own role in each
 * (CL-D7: many-to-many from day one, single-workspace UI until a switcher
 * exists). `currentWorkspace` is the earliest-joined one.
 */

export const workspaceMembershipSchema = z
  .object({
    workspace: workspaceSchema,
    role: workspaceRoleSchema,
  })
  .describe('WorkspaceMembership');

export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;

export const meResponseSchema = z
  .object({
    user: userSchema,
    workspaces: z.array(workspaceMembershipSchema),
    currentWorkspace: workspaceSchema,
  })
  .describe('MeResponse');

export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * The only field a user may change about themselves in MVP (CL-E13). `strict`
 * is what makes AC 11's "any other field is rejected with 422" true: an
 * unknown key fails validation rather than being silently dropped.
 */
export const mePatchSchema = z
  .object({
    theme: userThemeSchema,
  })
  .strict()
  .describe('MePatch');

export type MePatch = z.infer<typeof mePatchSchema>;
