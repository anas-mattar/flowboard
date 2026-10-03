import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { newId } from '../db/id.js';
import { sessionTable, userTable, type UserRow } from '../db/schema/index.js';
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiryFrom,
  shouldRenewSession,
} from '../auth/session-token.js';

/**
 * Session rows (CL-E9). The plaintext token exists only in the response that
 * issues it; the table stores its SHA-256 hash.
 */

export interface IssuedSession {
  /** Given to the client once, in the cookie or the body. Never stored, never logged. */
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface SessionContext {
  readonly userAgent?: string | undefined;
  readonly ip?: string | undefined;
}

/** `user_agent` is stored for the user's own session list (FB-19); keep it bounded. */
const USER_AGENT_MAX_LENGTH = 400;

/**
 * Creates a session for `userId` and returns the plaintext token.
 * Accepts any Drizzle handle so signup can issue the session inside the same
 * transaction as the user and workspace (FB-02 Â§4 item 1).
 */
export async function createSession(
  db: DbExecutor,
  userId: string,
  context: SessionContext = {},
  now: Date = new Date(),
): Promise<IssuedSession> {
  const token = generateSessionToken();
  const sessionId = newId();
  const expiresAt = sessionExpiryFrom(now);

  await db.insert(sessionTable).values({
    id: sessionId,
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    lastSeenAt: now,
    userAgent: context.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    ip: context.ip ?? null,
  });

  return { token, sessionId, expiresAt };
}

export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly user: UserRow;
  readonly expiresAt: Date;
}

/**
 * Resolves a plaintext token to its user, or `null`.
 *
 * A session past `expires_at` is deleted and rejected; a session whose
 * `last_seen_at` is more than a day old has both timestamps pushed out
 * (FB-02 Â§4 item 9). The lookup is by the token *hash*, which is unique, so
 * no comparison against attacker-supplied data happens in the query.
 */
export async function authenticateSessionToken(
  db: DbExecutor,
  token: string,
  now: Date = new Date(),
): Promise<AuthenticatedSession | null> {
  const tokenHash = hashSessionToken(token);

  const rows = await db
    .select({ session: sessionTable, user: userTable })
    .from(sessionTable)
    .innerJoin(userTable, eq(userTable.id, sessionTable.userId))
    .where(eq(sessionTable.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessionTable).where(eq(sessionTable.id, row.session.id));
    return null;
  }

  let expiresAt = row.session.expiresAt;

  if (shouldRenewSession(row.session.lastSeenAt, now)) {
    expiresAt = sessionExpiryFrom(now);

    await db
      .update(sessionTable)
      .set({ lastSeenAt: now, expiresAt, updatedAt: now })
      .where(eq(sessionTable.id, row.session.id));
  }

  return { sessionId: row.session.id, user: row.user, expiresAt };
}

/** Logout: revocation is a row delete, not a token blacklist (CL-E9). */
export async function deleteSession(db: DbExecutor, sessionId: string): Promise<void> {
  await db.delete(sessionTable).where(eq(sessionTable.id, sessionId));
}
