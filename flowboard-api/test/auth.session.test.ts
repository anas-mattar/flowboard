import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.js';
import {
  hashSessionToken,
  SESSION_RENEW_AFTER_MS,
  SESSION_TTL_MS,
} from '../src/auth/session-token.js';
import type { DatabaseHandle } from '../src/db/client.js';
import {
  buildTestApp,
  sessionCookieHeader,
  sessionCookieValue,
  signupBody,
  withBearer,
  withSessionCookie,
} from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * Sessions (FB-02 §10 integration row 3).
 * Covers AC 5 (cookie attributes), AC 6 (bearer parity), AC 8 (logout) and
 * AC 9 (expiry and renewal).
 */

let handle: DatabaseHandle;
let app: FastifyInstance;

const account = {
  email: 'session@example.test',
  password: 'a-long-enough-password',
  displayName: 'Session User',
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
});

async function signUp(): Promise<{ cookie: string; token: string }> {
  const cookieResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody(account),
  });
  expect(cookieResponse.statusCode).toBe(201);

  const bearerResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: account.email, password: account.password, tokenResponse: true },
  });

  return {
    cookie: sessionCookieValue(cookieResponse.headers) ?? '',
    token: bearerResponse.json<{ sessionToken: string }>().sessionToken,
  };
}

/**
 * The session timestamps as epoch milliseconds. Read through `extract(epoch)`
 * rather than relying on the driver's type mapping, so the assertion is about
 * the stored instant and not about how a `timestamptz` is decoded.
 */
async function sessionTimestamps(
  tokenHash: string,
): Promise<{ expiresAt: number; lastSeenAt: number }> {
  const rows = await handle.sql<{ expires_at: string; last_seen_at: string }[]>`
    select
      extract(epoch from expires_at)::text as expires_at,
      extract(epoch from last_seen_at)::text as last_seen_at
    from session
    where token_hash = ${tokenHash}
  `;

  const row = rows[0];
  if (row === undefined) throw new Error(`no session row for ${tokenHash}`);

  return {
    expiresAt: Math.round(Number(row.expires_at) * 1000),
    lastSeenAt: Math.round(Number(row.last_seen_at) * 1000),
  };
}

describe('the fb_session cookie (AC 5)', () => {
  it('is HttpOnly, SameSite=Lax, Path=/ with a 30-day Max-Age', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody(account),
    });

    const header = sessionCookieHeader(response.headers) ?? '';

    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  });

  it('is not Secure in development and is Secure otherwise', async () => {
    const { app: devApp } = await buildTestApp(handle, {
      env: { NODE_ENV: 'development' },
    });
    const { app: prodApp } = await buildTestApp(handle, {
      env: { SESSION_COOKIE_SECURE: 'true' },
    });

    try {
      const dev = await devApp.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: signupBody(),
      });
      const prod = await prodApp.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: signupBody(),
      });

      expect(sessionCookieHeader(dev.headers)).not.toContain('Secure');
      expect(sessionCookieHeader(prod.headers)).toContain('Secure');
    } finally {
      await devApp.close();
      await prodApp.close();
    }
  });

  it('never puts the token in the body on the cookie path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody(account),
    });
    const token = sessionCookieValue(response.headers) ?? '';

    expect(token).not.toBe('');
    expect(response.body).not.toContain(token);
  });

  it('stores only the hash of the token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody(account),
    });
    const token = sessionCookieValue(response.headers) ?? '';

    const rows = await handle.sql<{ token_hash: string }[]>`select token_hash from session`;

    expect(rows[0]?.token_hash).toBe(hashSessionToken(token));
    expect(rows[0]?.token_hash).not.toBe(token);
  });
});

describe('bearer and cookie are interchangeable (AC 6)', () => {
  it('authenticates GET /v1/me identically either way', async () => {
    const { cookie, token } = await signUp();

    const viaCookie = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });
    const viaBearer = await app.inject({ method: 'GET', url: '/v1/me', ...withBearer(token) });

    expect(viaCookie.statusCode).toBe(200);
    expect(viaBearer.statusCode).toBe(200);
    expect(viaBearer.json()).toEqual(viaCookie.json());
  });

  it('prefers the bearer token when both are present', async () => {
    const { token } = await signUp();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withBearer(token),
      cookies: { [SESSION_COOKIE_NAME]: 'a-token-that-does-not-exist-at-all' },
    });

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ['an unknown token', 'this-token-was-never-issued-by-us-at-all'],
    ['an empty token', ''],
  ])('returns 401 unauthenticated for %s on both paths', async (_label, token) => {
    const viaCookie = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(token),
    });
    const viaBearer = await app.inject({ method: 'GET', url: '/v1/me', ...withBearer(token) });

    for (const response of [viaCookie, viaBearer]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    }
  });

  it('returns 401 with no credentials at all', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });
});

describe('expiry and renewal (AC 9)', () => {
  it('rejects and deletes a session past its expiry', async () => {
    const { token } = await signUp();

    await handle.sql`
      update session set expires_at = now() - interval '1 minute'
      where token_hash = ${hashSessionToken(token)}
    `;

    const response = await app.inject({ method: 'GET', url: '/v1/me', ...withBearer(token) });

    expect(response.statusCode).toBe(401);

    const rows = await handle.sql<{ count: string }[]>`
      select count(*)::text from session where token_hash = ${hashSessionToken(token)}
    `;
    expect(rows[0]?.count).toBe('0');
  });

  it('renews a session whose last use was more than a day ago', async () => {
    const { token } = await signUp();
    const tokenHash = hashSessionToken(token);

    await handle.sql`
      update session
      set last_seen_at = now() - interval '2 days', expires_at = now() + interval '28 days'
      where token_hash = ${tokenHash}
    `;

    const response = await app.inject({ method: 'GET', url: '/v1/me', ...withBearer(token) });
    expect(response.statusCode).toBe(200);

    const after = await sessionTimestamps(tokenHash);

    expect(after.expiresAt).toBeGreaterThan(Date.now() + SESSION_TTL_MS - SESSION_RENEW_AFTER_MS);
    expect(after.lastSeenAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it('does not renew a session used again within the day', async () => {
    const { token } = await signUp();
    const tokenHash = hashSessionToken(token);

    const before = await sessionTimestamps(tokenHash);

    await app.inject({ method: 'GET', url: '/v1/me', ...withBearer(token) });

    const after = await sessionTimestamps(tokenHash);

    expect(after.expiresAt).toBe(before.expiresAt);
  });
});

describe('POST /v1/auth/logout (AC 8)', () => {
  it('returns 204, deletes the row and clears the cookie', async () => {
    const { cookie } = await signUp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(204);

    const header = sessionCookieHeader(response.headers) ?? '';
    expect(header).toMatch(/fb_session=;|fb_session=""/);
    expect(header).toContain('Expires=Thu, 01 Jan 1970');

    const rows = await handle.sql<{ count: string }[]>`
      select count(*)::text from session where token_hash = ${hashSessionToken(cookie)}
    `;
    expect(rows[0]?.count).toBe('0');
  });

  it('makes the same token unusable afterwards', async () => {
    const { token } = await signUp();

    await app.inject({ method: 'POST', url: '/v1/auth/logout', ...withBearer(token) });

    const after = await app.inject({ method: 'GET', url: '/v1/me', ...withBearer(token) });
    expect(after.statusCode).toBe(401);
  });

  it('leaves the user’s other sessions alone', async () => {
    const { cookie, token } = await signUp();

    await app.inject({ method: 'POST', url: '/v1/auth/logout', ...withBearer(token) });

    const stillValid = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });
    expect(stillValid.statusCode).toBe(200);
  });

  it('returns 401 without a session', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/logout' });

    expect(response.statusCode).toBe(401);
  });
});
