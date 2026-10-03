import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque session tokens (CL-E9, FB-02 §4 items 5 and 6).
 *
 * 32 random bytes, base64url-encoded, given to the client once. Only the
 * SHA-256 hash is stored (FS §8), so a database leak does not yield usable
 * sessions. SHA-256 is correct here and argon2 is not: the token is already
 * 256 bits of entropy, so there is nothing to brute-force, and lookups happen
 * on every authenticated request.
 */

/** Entropy per token, in bytes (CL-E9). */
export const SESSION_TOKEN_BYTES = 32 as const;

/** Length of the base64url encoding of 32 bytes, without padding. */
export const SESSION_TOKEN_LENGTH = 43 as const;

/** Sessions expire 30 days after last use (CL-E9). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A session older than this since `last_seen_at` is renewed on use (CL-E9). */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/** The value stored in `session.token_hash`. Lower-case hex SHA-256. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two token hashes of equal length. */
export function sessionTokenHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

/** `expires_at` for a session seen at `now`. */
export function sessionExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/** Whether a session last seen at `lastSeenAt` should have its expiry pushed out. */
export function shouldRenewSession(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > SESSION_RENEW_AFTER_MS;
}
