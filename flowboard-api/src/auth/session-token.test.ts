import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiryFrom,
  sessionTokenHashEquals,
  shouldRenewSession,
  SESSION_RENEW_AFTER_MS,
  SESSION_TOKEN_LENGTH,
  SESSION_TTL_MS,
} from './session-token.js';

/** FB-02 §10 unit row `auth/session-token.test.ts`; covers AC 5, 6 and 9. */

describe('generateSessionToken', () => {
  it('returns 32 bytes of entropy as unpadded base64url', () => {
    const token = generateSessionToken();

    expect(token).toHaveLength(SESSION_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does not repeat across a large sample', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSessionToken));

    expect(tokens.size).toBe(1000);
  });
});

describe('hashSessionToken', () => {
  it('is SHA-256 hex and never the token itself', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
  });

  it('is deterministic', () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });
});

describe('sessionTokenHashEquals', () => {
  it('matches equal hashes and rejects different ones', () => {
    const hash = hashSessionToken('a');

    expect(sessionTokenHashEquals(hash, hash)).toBe(true);
    expect(sessionTokenHashEquals(hash, hashSessionToken('b'))).toBe(false);
  });

  it('returns false for different lengths rather than throwing', () => {
    expect(sessionTokenHashEquals('abc', 'abcd')).toBe(false);
  });
});

describe('expiry and renewal', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');

  it('expires 30 days after last use', () => {
    expect(sessionExpiryFrom(now).getTime() - now.getTime()).toBe(SESSION_TTL_MS);
  });

  it('renews only once the session is more than a day old', () => {
    const justUnder = new Date(now.getTime() - SESSION_RENEW_AFTER_MS + 1000);
    const justOver = new Date(now.getTime() - SESSION_RENEW_AFTER_MS - 1000);

    expect(shouldRenewSession(now, now)).toBe(false);
    expect(shouldRenewSession(justUnder, now)).toBe(false);
    expect(shouldRenewSession(justOver, now)).toBe(true);
  });
});
