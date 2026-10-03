import argon2 from 'argon2';

/**
 * Password hashing (FS §8, CL-E10, FB-02 §4 item 2).
 *
 * argon2id with the OWASP Password Storage Cheat Sheet parameters for the
 * "19 MiB memory, 2 iterations, 1 degree of parallelism" configuration. The
 * numbers live here only, so changing them is one edit and one test.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Every hash this module writes starts with this prefix (FB-02 §4 item 2). */
export const ARGON2ID_PREFIX = '$argon2id$';

/** Hashes a plaintext password. The plaintext is never logged or returned. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies `password` against `hash`. A malformed or foreign hash is a
 * mismatch, not an exception: the seed and older rows must never be able to
 * turn a failed login into a 500.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * A real argon2id hash of a value no one can log in with, verified when the
 * email is unknown so that login takes comparable time either way
 * (FB-02 §4 item 4). Computed once, lazily, and reused.
 */
let dummyHashPromise: Promise<string> | undefined;

export function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(
    // Not a credential: nothing accepts this value, it exists only to be
    // verified against and burn the same CPU as a real check.
    'flowboard-unknown-account-placeholder',
  );

  return dummyHashPromise;
}

/**
 * Burns one argon2id verification so an unknown email costs the same as a
 * wrong password. Always resolves `false`.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(await dummyPasswordHash(), password);
  return false;
}
