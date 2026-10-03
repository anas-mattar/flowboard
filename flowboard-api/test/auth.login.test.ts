import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp, sessionCookieValue, signupBody } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * `POST /v1/auth/login` (FB-02 §10 integration row 2).
 * Covers AC 4 (one uniform `401`, comparable timing) and the `tokenResponse`
 * path of AC 5.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;

const account = {
  email: 'ada@example.test',
  password: 'a-long-enough-password',
  displayName: 'Ada Lovelace',
};

beforeAll(async () => {
  handle = await openTestDatabase();
  ({ app } = await buildTestApp(handle));
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  await resetDatabase(handle);

  const created = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody(account),
  });
  expect(created.statusCode).toBe(201);
});

function login(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/v1/auth/login', payload });
}

describe('POST /v1/auth/login — success', () => {
  it('returns 200 with the user, their workspace and a session cookie', async () => {
    const response = await login({ email: account.email, password: account.password });

    expect(response.statusCode).toBe(200);

    const json = response.json<{
      user: { email: string };
      workspace: { name: string };
      sessionToken?: string;
    }>();

    expect(json.user.email).toBe(account.email);
    expect(json.workspace.name).toBe("Ada Lovelace's workspace");
    expect(json.sessionToken).toBeUndefined();
    expect(sessionCookieValue(response.headers)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('matches the email case-insensitively', async () => {
    const response = await login({ email: 'ADA@Example.TEST', password: account.password });

    expect(response.statusCode).toBe(200);
  });

  it('trims a padded email', async () => {
    const response = await login({ email: '  ada@example.test ', password: account.password });

    expect(response.statusCode).toBe(200);
  });

  it('returns the token in the body and sets no cookie with tokenResponse (AC 5)', async () => {
    const response = await login({
      email: account.email,
      password: account.password,
      tokenResponse: true,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ sessionToken: string }>().sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('adds one session row per login rather than reusing one', async () => {
    await login({ email: account.email, password: account.password });
    await login({ email: account.email, password: account.password });

    const rows = await handle.sql<{ count: string }[]>`select count(*)::text from session`;
    // One from signup plus two logins.
    expect(Number(rows[0]?.count)).toBe(3);
  });

  it('never returns the password hash', async () => {
    const response = await login({ email: account.email, password: account.password });

    expect(response.body).not.toContain('$argon2id$');
    expect(response.body).not.toContain('passwordHash');
  });
});

describe('POST /v1/auth/login — failure is uniform (AC 4)', () => {
  it('returns the same body for a wrong password and an unknown email', async () => {
    const wrongPassword = await login({ email: account.email, password: 'wrong-password-here' });
    const unknownEmail = await login({ email: 'nobody@example.test', password: account.password });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.json()).toMatchObject({ error: { code: 'invalid_credentials' } });
  });

  it('sets no cookie and creates no session on failure', async () => {
    const before = await handle.sql<{ count: string }[]>`select count(*)::text from session`;

    const response = await login({ email: account.email, password: 'wrong-password-here' });

    expect(response.headers['set-cookie']).toBeUndefined();

    const after = await handle.sql<{ count: string }[]>`select count(*)::text from session`;
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it('takes comparable time for an unknown email and a wrong password', async () => {
    // An unknown email verifies a dummy hash, so the two paths both pay for
    // one argon2id verification. The tolerance is wide because CI timing is
    // noisy; the test exists to catch the *absence* of the dummy verify,
    // which shows up as an order-of-magnitude difference.
    const sample = async (payload: Record<string, unknown>): Promise<number> => {
      const started = process.hrtime.bigint();
      await login(payload);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    // Warm up, so the first argon2 call's allocation is not measured.
    await sample({ email: account.email, password: 'warm-up-password' });

    const wrongPassword = await sample({ email: account.email, password: 'wrong-password-here' });
    const unknownEmail = await sample({ email: 'nobody@example.test', password: 'wrong-password' });

    const ratio = Math.max(wrongPassword, unknownEmail) / Math.min(wrongPassword, unknownEmail);
    expect(ratio).toBeLessThan(5);
  });

  it.each([
    ['an invalid email', { email: 'not-an-email', password: 'x' }],
    ['an empty password', { email: account.email, password: '' }],
    ['an unknown field', { email: account.email, password: 'x', remember: true }],
    ['no body at all', {}],
  ])('rejects %s with 422 before touching the database', async (_label, payload) => {
    const response = await login(payload);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });
});
