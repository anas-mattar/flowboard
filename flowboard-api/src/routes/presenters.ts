import { userThemeSchema, workspacePlanSchema, type User, type Workspace } from '@flowboard/shared';
import type { UserRow, WorkspaceRow } from '../db/schema/index.js';

/**
 * Row-to-response mapping (FB-01 §6: snake_case columns, camelCase JSON,
 * timestamps as UTC ISO 8601 strings).
 *
 * Every field is named explicitly rather than spread, so a column added later
 * — `password_hash` being the one that matters — cannot leak into a response
 * by accident (FS §8).
 *
 * `theme` and `plan` are `text` columns guarded by CHECK constraints, so they
 * are parsed rather than cast: an unexpected value fails here instead of
 * reaching the client.
 */

export function presentUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    initials: row.initials,
    avatarColor: row.avatarColor,
    theme: userThemeSchema.parse(row.theme),
    createdAt: row.createdAt.toISOString(),
  };
}

export function presentWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    plan: workspacePlanSchema.parse(row.plan),
    createdAt: row.createdAt.toISOString(),
  };
}
