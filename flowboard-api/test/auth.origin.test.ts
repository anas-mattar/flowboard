import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseHandle } from '../src/db/client.js';
import {
  buildTestApp,
  sessionCookieValue,
  signupBody,
  TEST_WEB_ORIGIN,
  withBearer,
  withSessionCookie,
} from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * The `Origin` check on cookie-authenticated mutations
 * (FB-02 §10 integration row 4, AC 7).
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie: string;
let token: string;

const account = {
  email: 'origin@example.test',
  password: 'a-long-enough-password',
  displayName: 'Origin User',
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

  const signup = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody(account),
  });
  cookie = sessionCookieValue(signup.headers) ?? '';

  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: account.email, password: account.password, tokenResponse: true },
  });
  token = login.json<{ sessionToken: string }>().sessionToken;
});

describe('cookie-authenticated mutations', () => {
  it('allows a PATCH from the configured web origin', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
      headers: { origin: TEST_WEB_ORIGIN },
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows a PATCH with no Origin header at all', async () => {
    // SameSite=Lax already blocks the cross-site form post this would be.
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ['a foreign origin', 'https://evil.test'],
    ['a look-alike origin', `${TEST_WEB_ORIGIN}.evil.test`],
    ['the opaque null origin', 'null'],
  ])('rejects a PATCH from %s with 403 bad_origin', async (_label, origin) => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
      headers: { origin },
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'bad_origin' } });
  });

  it('rejects a POST logout from a foreign origin and leaves the session alive', async () => {
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: 'https://evil.test' },
      ...withSessionCookie(cookie),
    });

    expect(rejected.statusCode).toBe(403);

    const stillValid = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });
    expect(stillValid.statusCode).toBe(200);
  });

  it('does not change the theme when the origin is refused', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
      headers: { origin: 'https://evil.test' },
      ...withSessionCookie(cookie),
    });

    const me = await app.inject({ method: 'GET', url: '/v1/me', ...withSessionCookie(cookie) });
    expect(me.json<{ user: { theme: string } }>().user.theme).toBe('system');
  });
});

describe('safe methods and bearer requests are exempt', () => {
  it('allows a GET from a foreign origin on the cookie path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { origin: 'https://evil.test' },
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows a bearer PATCH from a foreign origin', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
      headers: { origin: 'https://evil.test', authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows a bearer logout from a foreign origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: 'https://evil.test' },
      ...withBearer(token),
    });

    expect(response.statusCode).toBe(204);
  });
});
