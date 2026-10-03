import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ARGON2ID_PREFIX } from '../src/auth/password.js';
import { createAccount, EmailTakenError } from '../src/repositories/account.js';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp, CapturingStream, sessionCookieValue, signupBody } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * `POST /v1/auth/signup` (FB-02 §10 integration row 1).
 * Covers AC 1 (bootstrap and rollback), AC 2 (hashing and log scrubbing)
 * and AC 3 (validation and the case-insensitive duplicate).
 */

let handle: DatabaseHandle;
let app: FastifyInstance;

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

async function countOf(table: string): Promise<number> {
  const rows = await handle.sql.unsafe<{ count: string }[]>(
    `select count(*)::text from "${table}"`,
  );

  return Number(rows[0]?.count ?? '0');
}

describe('POST /v1/auth/signup — happy path (AC 1)', () => {
  it('returns 201 with the user and the bootstrapped workspace', async () => {
    const body = signupBody({ displayName: 'Ada Lovelace' });

    const response = await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: body });

    expect(response.statusCode).toBe(201);

    const json = response.json<{
      user: { id: string; email: string; displayName: string; initials: string; theme: string };
      workspace: { id: string; name: string; plan: string };
      sessionToken?: string;
    }>();

    expect(json.user.email).toBe(body['email']);
    expect(json.user.displayName).toBe('Ada Lovelace');
    expect(json.user.initials).toBe('AL');
    expect(json.user.theme).toBe('system');
    expect(json.workspace.name).toBe("Ada Lovelace's workspace");
    expect(json.workspace.plan).toBe('free');
    expect(json.sessionToken).toBeUndefined();
  });

  it('writes exactly one user, workspace, admin membership and session', async () => {
    await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: signupBody() });

    expect(await countOf('user')).toBe(1);
    expect(await countOf('workspace')).toBe(1);
    expect(await countOf('session')).toBe(1);

    const members = await handle.sql<{ role: string }[]>`select role from workspace_member`;
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('admin');
  });

  it('writes the two CL-E20 funnel events', async () => {
    await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: signupBody() });

    const events = await handle.sql<{ type: string; user_id: string; workspace_id: string }[]>`
      select type, user_id, workspace_id from funnel_event order by type
    `;

    expect(events.map((event) => event.type)).toEqual(['user.signed_up', 'workspace.created']);
    for (const event of events) {
      expect(event.user_id).not.toBeNull();
      expect(event.workspace_id).not.toBeNull();
    }
  });

  it('trims the email before storing it', async () => {
    const body = signupBody();
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...body, email: `  ${String(body['email'])}  ` },
    });

    const rows = await handle.sql<{ email: string }[]>`select email from "user"`;
    expect(rows[0]?.email).toBe(body['email']);
  });

  it('returns the token in the body and no cookie when tokenResponse is true', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ tokenResponse: true }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ sessionToken?: string }>().sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /v1/auth/signup — hashing and logging (AC 2)', () => {
  it('stores an argon2id hash and never the plaintext', async () => {
    const body = signupBody({ password: 'a-very-memorable-password' });

    await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: body });

    const rows = await handle.sql<{ password_hash: string }[]>`
      select password_hash from "user"
    `;
    const hash = rows[0]?.password_hash ?? '';

    expect(hash.startsWith(ARGON2ID_PREFIX)).toBe(true);
    expect(hash).not.toContain('a-very-memorable-password');
  });

  it('does not write the password, the token or the cookie to the log', async () => {
    // A second app instance logging at `trace` into a captured stream, so the
    // assertion is about real pino output rather than a stub.
    const stream = new CapturingStream();
    const { app: logged } = await buildTestApp(handle, {
      env: { LOG_LEVEL: 'trace' },
      loggerStream: stream,
    });

    try {
      const body = signupBody({ password: 'log-scrubbing-canary-password' });
      const cookieResponse = await logged.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: body,
      });
      const bearerResponse = await logged.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: body['email'], password: body['password'], tokenResponse: true },
      });

      const token = bearerResponse.json<{ sessionToken: string }>().sessionToken;
      await logged.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });

      const output = stream.text;

      expect(output.length).toBeGreaterThan(0);
      expect(output).not.toContain('log-scrubbing-canary-password');
      expect(output).not.toContain(token);
      expect(output).not.toContain(sessionCookieValue(cookieResponse.headers) ?? 'no-cookie-found');
    } finally {
      await logged.close();
    }
  });
});

describe('POST /v1/auth/signup — validation (AC 3)', () => {
  const longEmail = `${'a'.repeat(243)}@example.test`;

  it.each([
    ['an invalid email', { email: 'not-an-email' }],
    ['an email over 254 characters', { email: longEmail }],
    ['a password under 10 characters', { password: 'short' }],
    ['a password over 128 characters', { password: 'a'.repeat(129) }],
    ['an empty display name', { displayName: '' }],
    ['a whitespace-only display name', { displayName: '   ' }],
    ['a display name over 80 characters', { displayName: 'a'.repeat(81) }],
    ['an unknown field', { isAdmin: true }],
  ])('rejects %s with 422 and field-level details', async (_label, override) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody(override),
    });

    expect(response.statusCode).toBe(422);

    const json = response.json<{ error: { code: string; details?: unknown } }>();
    expect(json.error.code).toBe('validation_failed');
    expect(json.error.details).toBeDefined();
    expect(await countOf('user')).toBe(0);
  });

  it('rejects a missing body with 422', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: {} });

    expect(response.statusCode).toBe(422);
  });

  it('accepts an email of exactly 254 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ email: `${'a'.repeat(241)}@example.test` }),
    });

    expect(response.statusCode).toBe(201);
  });
});

describe('POST /v1/auth/signup — duplicate email (AC 3)', () => {
  it('returns 409 email_taken for the same address in different case', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ email: 'a@example.test' }),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ email: 'A@Example.test' }),
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'email_taken' } });
    expect(await countOf('user')).toBe(1);
  });

  it('leaves no extra workspace or session behind after a duplicate', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ email: 'dup@example.test' }),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ email: 'DUP@example.test' }),
    });

    expect(await countOf('workspace')).toBe(1);
    expect(await countOf('session')).toBe(1);
    expect(await countOf('funnel_event')).toBe(2);
  });
});

describe('signup transaction rollback (AC 1)', () => {
  it('leaves no rows at all when the bootstrap fails after the user insert', async () => {
    await expect(
      createAccount(
        handle.db,
        {
          email: 'rollback@example.test',
          passwordHash: `${ARGON2ID_PREFIX}placeholder`,
          displayName: 'Rollback Case',
          session: {},
        },
        {
          onAfterUserInsert: () => {
            throw new Error('forced failure after the user insert');
          },
        },
      ),
    ).rejects.toThrow('forced failure after the user insert');

    expect(await countOf('user')).toBe(0);
    expect(await countOf('workspace')).toBe(0);
    expect(await countOf('workspace_member')).toBe(0);
    expect(await countOf('session')).toBe(0);
    expect(await countOf('funnel_event')).toBe(0);
  });

  it('maps the unique-email violation to EmailTakenError', async () => {
    const input = {
      email: 'collide@example.test',
      passwordHash: `${ARGON2ID_PREFIX}placeholder`,
      displayName: 'First One',
      session: {},
    };

    await createAccount(handle.db, input);

    await expect(
      createAccount(handle.db, { ...input, email: 'COLLIDE@example.test' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});
