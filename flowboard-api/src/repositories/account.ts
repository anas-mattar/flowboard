import type { FunnelEventType, UserTheme } from '@flowboard/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { newId } from '../db/id.js';
import {
  funnelEventTable,
  userTable,
  workspaceMemberTable,
  workspaceTable,
  type UserRow,
  type WorkspaceRow,
} from '../db/schema/index.js';
import { deriveAvatarColor } from '../users/avatar-color.js';
import { deriveInitials } from '../users/initials.js';
import { createSession, type IssuedSession, type SessionContext } from './session.js';

/**
 * Account persistence for FB-02: the signup bootstrap transaction (CL-E12),
 * the login lookup, and the `GET /v1/me` read.
 */

/** Raised when the `lower(email)` unique index rejects a signup (AC 3). */
export class EmailTakenError extends Error {
  public override readonly name = 'EmailTakenError';
}

/** PostgreSQL `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * Drizzle wraps a driver error in a `DrizzleQueryError` carrying the original
 * as `cause`, so the SQLSTATE is not on the error that is thrown. The chain is
 * walked with a depth bound rather than trusting it to be short.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * The workspace a new signup lands in (CL-E12). The string is formatted here
 * rather than in the route so the one place that knows the format is the one
 * place that writes the row; `workspace.defaultName` in the web catalogue
 * carries the same wording for the UI.
 */
export function defaultWorkspaceName(displayName: string): string {
  return `${displayName}'s workspace`;
}

export interface SignupInput {
  /** Already trimmed by `signupRequestSchema`. */
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly session: SessionContext;
}

export interface SignupResult {
  readonly user: UserRow;
  readonly workspace: WorkspaceRow;
  readonly session: IssuedSession;
}

/**
 * Creates the user, their workspace, the `admin` membership, the session and
 * both funnel events in one transaction (AC 1). Anything that throws inside
 * leaves no rows at all.
 *
 * `onAfterUserInsert` exists for the rollback test in
 * `test/auth.signup.test.ts`: it is the only way to force a failure after the
 * user row is written without mocking the database, which STANDARDS §4 does
 * not accept as integration coverage.
 */
export async function createAccount(
  db: Database,
  input: SignupInput,
  hooks: { onAfterUserInsert?: () => Promise<void> | void } = {},
): Promise<SignupResult> {
  const userId = newId();
  const workspaceId = newId();

  try {
    return await db.transaction(async (tx) => {
      const insertedUsers = await tx
        .insert(userTable)
        .values({
          id: userId,
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          initials: deriveInitials(input.displayName),
          avatarColor: deriveAvatarColor(userId),
          theme: 'system',
        })
        .returning();

      const user = insertedUsers[0];
      if (user === undefined) throw new Error('signup: the user insert returned no row');

      await hooks.onAfterUserInsert?.();

      const insertedWorkspaces = await tx
        .insert(workspaceTable)
        .values({
          id: workspaceId,
          name: defaultWorkspaceName(input.displayName),
          createdBy: userId,
        })
        .returning();

      const workspace = insertedWorkspaces[0];
      if (workspace === undefined) throw new Error('signup: the workspace insert returned no row');

      // CL-A9: the creator is the workspace admin, and in MVP the only one.
      await tx.insert(workspaceMemberTable).values({ workspaceId, userId, role: 'admin' });

      // CL-E20: the two funnel events MVP-1 writes at signup.
      await tx.insert(funnelEventTable).values([
        {
          id: newId(),
          workspaceId,
          userId,
          type: 'user.signed_up' satisfies FunnelEventType,
          payload: {},
        },
        {
          id: newId(),
          workspaceId,
          userId,
          type: 'workspace.created' satisfies FunnelEventType,
          payload: {},
        },
      ]);

      const session = await createSession(tx, userId, input.session);

      return { user, workspace, session };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError('email already registered');
    throw error;
  }
}

/**
 * Finds a user by email, case-insensitively (CL-E10). Returns `null` rather
 * than throwing so the caller can spend the same time on a dummy hash
 * verification and return the one `invalid_credentials` body (AC 4).
 */
export async function findUserByEmail(db: DbExecutor, email: string): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(userTable)
    .where(sql`lower(${userTable.email}) = lower(${email})`)
    .limit(1);

  return rows[0] ?? null;
}

export interface Membership {
  readonly workspace: WorkspaceRow;
  readonly role: 'admin' | 'member';
}

/**
 * The caller's workspaces with their own role in each, earliest-joined first
 * so `currentWorkspace` is simply the head of the list (CL-E12, CL-D7).
 */
export async function findMemberships(db: DbExecutor, userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ workspace: workspaceTable, role: workspaceMemberTable.role })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceTable.id, workspaceMemberTable.workspaceId))
    .where(eq(workspaceMemberTable.userId, userId))
    .orderBy(asc(workspaceMemberTable.createdAt), asc(workspaceTable.id));

  // `role` is a free `text` column constrained by a CHECK, so narrow it here
  // rather than letting an unexpected value escape into the response schema.
  return rows.flatMap((row) =>
    row.role === 'admin' || row.role === 'member'
      ? [{ workspace: row.workspace, role: row.role }]
      : [],
  );
}

/** `PATCH /v1/me` (CL-E13). Theme is the only field a user may change in MVP. */
export async function updateUserTheme(
  db: DbExecutor,
  userId: string,
  theme: UserTheme,
): Promise<UserRow | null> {
  const rows = await db
    .update(userTable)
    .set({ theme, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
    .returning();

  return rows[0] ?? null;
}
