import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import {
  ARGON2ID_PREFIX,
  ARGON2_OPTIONS,
  dummyPasswordHash,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from './password.js';

/** FB-02 §10 unit row `auth/password.test.ts`; covers AC 2 and AC 4. */

describe('hashPassword', () => {
  it('produces an argon2id hash that verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash.startsWith(ARGON2ID_PREFIX)).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('never contains the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toContain('correct horse battery staple');
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password'),
      hashPassword('same password'),
    ]);

    expect(a).not.toBe(b);
  });

  it('uses the OWASP parameters', async () => {
    const hash = await hashPassword('parameter check password');

    expect(ARGON2_OPTIONS).toEqual({
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
    // The encoded hash carries the parameters it was produced with.
    expect(hash).toContain('m=19456,t=2,p=1');
  });
});

describe('verifyPassword', () => {
  it('rejects the wrong password', async () => {
    const hash = await hashPassword('the right one');

    expect(await verifyPassword(hash, 'the wrong one')).toBe(false);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
  });
});

describe('dummyPasswordHash', () => {
  it('is a real argon2id hash and is memoised', async () => {
    const first = await dummyPasswordHash();

    expect(first.startsWith(ARGON2ID_PREFIX)).toBe(true);
    expect(await dummyPasswordHash()).toBe(first);
  });

  it('never accepts any password', async () => {
    expect(await verifyAgainstDummy('flowboard-unknown-account-placeholder')).toBe(false);
    expect(await verifyAgainstDummy('anything else')).toBe(false);
  });
});
