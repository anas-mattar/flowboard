import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RateLimiter } from '../src/auth/rate-limit.js';
import { LOGIN_EMAIL_RULE, LOGIN_IP_RULE, SIGNUP_IP_RULE } from '../src/config/rate-limits.js';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp, signupBody } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * Rate limits on the authentication routes
 * (FB-02 §10 integration row 5, AC 10, CL-E11).
 *
 * This file is the only one that builds the app with the limiter live.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let rateLimiter: RateLimiter;

const account = {
  email: 'limited@example.test',
  password: 'a-long-enough-password',
  displayName: 'Limited User',
};

beforeAll(async () => {
  handle = await openTestDatabase();
  ({ app, rateLimiter } = await buildTestApp(handle, { rateLimit: true }));
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  await resetDatabase(handle);
  rateLimiter.reset();
});

/** `inject` defaults every request to the same remote address. */
function login(payload: Record<string, unknown>, ip?: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload,
    ...(ip === undefined ? {} : { remoteAddress: ip }),
  });
}

describe('login limits (AC 10, CL-E11)', () => {
  it('returns 429 with Retry-After on the 11th attempt from one IP', async () => {
    // Ten different emails, so only the per-IP rule can fire.
    for (let attempt = 0; attempt < LOGIN_IP_RULE.limit; attempt += 1) {
      const response = await login({ email: `a${attempt}@example.test`, password: 'whatever-x' });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await login({ email: 'a99@example.test', password: 'whatever-x' });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: 'rate_limited' } });

    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LOGIN_IP_RULE.windowMs / 1000);
  });

  it('returns 429 on the 6th attempt for one email, even from different IPs', async () => {
    for (let attempt = 0; attempt < LOGIN_EMAIL_RULE.limit; attempt += 1) {
      const response = await login(
        { email: account.email, password: 'wrong-password' },
        `10.0.0.${attempt}`,
      );
      expect(response.statusCode).toBe(401);
    }

    const blocked = await login({ email: account.email, password: 'wrong-password' }, '10.0.0.99');

    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('counts an email case-insensitively', async () => {
    for (let attempt = 0; attempt < LOGIN_EMAIL_RULE.limit; attempt += 1) {
      await login({ email: account.email, password: 'wrong-password' }, `10.1.0.${attempt}`);
    }

    const blocked = await login({ email: 'LIMITED@Example.TEST', password: 'x' }, '10.1.0.99');

    expect(blocked.statusCode).toBe(429);
  });

  it('counts a successful login too, so a valid password is not an escape hatch', async () => {
    await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: signupBody(account) });
    rateLimiter.reset();

    for (let attempt = 0; attempt < LOGIN_EMAIL_RULE.limit; attempt += 1) {
      const response = await login({ email: account.email, password: account.password });
      expect(response.statusCode).toBe(200);
    }

    const blocked = await login({ email: account.email, password: account.password });
    expect(blocked.statusCode).toBe(429);
  });

  it('does not create a session for a blocked attempt', async () => {
    await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: signupBody(account) });
    rateLimiter.reset();

    for (let attempt = 0; attempt <= LOGIN_EMAIL_RULE.limit; attempt += 1) {
      await login({ email: account.email, password: account.password });
    }

    const rows = await handle.sql<{ count: string }[]>`select count(*)::text from session`;
    // One from signup plus the five allowed logins; the sixth was refused.
    expect(Number(rows[0]?.count)).toBe(1 + LOGIN_EMAIL_RULE.limit);
  });
});

describe('signup limits (AC 10, CL-E11)', () => {
  it('returns 429 on the 6th signup from one IP within the hour', async () => {
    for (let attempt = 0; attempt < SIGNUP_IP_RULE.limit; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: signupBody(),
      });
      expect(response.statusCode).toBe(201);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody(),
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('creates no user for a blocked signup', async () => {
    for (let attempt = 0; attempt <= SIGNUP_IP_RULE.limit; attempt += 1) {
      await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: signupBody() });
    }

    const rows = await handle.sql<{ count: string }[]>`select count(*)::text from "user"`;
    expect(Number(rows[0]?.count)).toBe(SIGNUP_IP_RULE.limit);
  });

  it('counts signup separately from login on the same IP', async () => {
    for (let attempt = 0; attempt < SIGNUP_IP_RULE.limit; attempt += 1) {
      await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: signupBody() });
    }

    // Signup is exhausted; login from the same IP still works.
    const response = await login({ email: 'nobody@example.test', password: 'whatever-x' });
    expect(response.statusCode).toBe(401);
  });
});

describe('the limiter is off when RATE_LIMIT_DISABLED is true', () => {
  it('lets a test file sign up more than the hourly limit', async () => {
    const { app: unlimited } = await buildTestApp(handle);

    try {
      for (let attempt = 0; attempt <= SIGNUP_IP_RULE.limit + 2; attempt += 1) {
        const response = await unlimited.inject({
          method: 'POST',
          url: '/v1/auth/signup',
          payload: signupBody(),
        });
        expect(response.statusCode).toBe(201);
      }
    } finally {
      await unlimited.close();
    }
  });
});
