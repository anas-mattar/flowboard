import { AVATAR_COLORS } from '@flowboard/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseHandle } from '../src/db/client.js';
import { newId } from '../src/db/id.js';
import { buildTestApp, sessionCookieValue, signupBody, withSessionCookie } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * `GET /v1/me` and `PATCH /v1/me` (FB-02 §10 integration row 6).
 * Covers AC 11, AC 12 and AC 16.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie: string;
let userId: string;

const account = {
  email: 'me@example.test',
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

  const signup = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody(account),
  });

  cookie = sessionCookieValue(signup.headers) ?? '';
  userId = signup.json<{ user: { id: string } }>().user.id;
});

describe('GET /v1/me (AC 11)', () => {
  it('returns the caller, their workspaces with roles and the current workspace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(200);

    const json = response.json<{
      user: { id: string; email: string; initials: string; avatarColor: string; theme: string };
      workspaces: { workspace: { id: string; name: string }; role: string }[];
      currentWorkspace: { id: string };
    }>();

    expect(json.user.id).toBe(userId);
    expect(json.user.email).toBe(account.email);
    expect(json.workspaces).toHaveLength(1);
    expect(json.workspaces[0]?.role).toBe('admin');
    expect(json.workspaces[0]?.workspace.name).toBe("Ada Lovelace's workspace");
    expect(json.currentWorkspace.id).toBe(json.workspaces[0]?.workspace.id);
  });

  it('derives initials and an avatar colour from the PT palette (AC 12)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });

    const user = response.json<{ user: { initials: string; avatarColor: string } }>().user;

    expect(user.initials).toBe('AL');
    expect(AVATAR_COLORS).toContain(user.avatarColor);
  });

  it('never returns the password hash', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });

    expect(response.body).not.toContain('$argon2id$');
    expect(response.body).not.toContain('password');
  });

  it('returns the earliest-joined workspace as the current one (CL-D7)', async () => {
    // A second workspace joined later must not displace the bootstrap one.
    const secondId = newId();
    await handle.sql`
      insert into workspace (id, name, created_by) values (${secondId}, 'Later Workspace', ${userId})
    `;
    await handle.sql`
      insert into workspace_member (workspace_id, user_id, role, created_at)
      values (${secondId}, ${userId}, 'member', now() + interval '1 hour')
    `;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(cookie),
    });
    const json = response.json<{
      workspaces: { workspace: { name: string } }[];
      currentWorkspace: { name: string };
    }>();

    expect(json.workspaces).toHaveLength(2);
    expect(json.currentWorkspace.name).toBe("Ada Lovelace's workspace");
  });

  it('returns 401 without a session (AC 16)', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('only ever returns the caller, whatever else is in the database (AC 16)', async () => {
    const otherSignup = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: signupBody({ email: 'other@example.test', displayName: 'Other Person' }),
    });
    const otherCookie = sessionCookieValue(otherSignup.headers) ?? '';

    const mine = await app.inject({ method: 'GET', url: '/v1/me', ...withSessionCookie(cookie) });
    const theirs = await app.inject({
      method: 'GET',
      url: '/v1/me',
      ...withSessionCookie(otherCookie),
    });

    expect(mine.json<{ user: { email: string } }>().user.email).toBe(account.email);
    expect(theirs.json<{ user: { email: string } }>().user.email).toBe('other@example.test');
    expect(mine.body).not.toContain('other@example.test');
    expect(theirs.body).not.toContain(account.email);
  });
});

describe('PATCH /v1/me (AC 11)', () => {
  it.each(['light', 'dark', 'system'] as const)('persists theme %s', async (theme) => {
    const patched = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme },
      ...withSessionCookie(cookie),
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ theme: string }>().theme).toBe(theme);

    const me = await app.inject({ method: 'GET', url: '/v1/me', ...withSessionCookie(cookie) });
    expect(me.json<{ user: { theme: string } }>().user.theme).toBe(theme);
  });

  it('writes the column, not just the response', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
      ...withSessionCookie(cookie),
    });

    const rows = await handle.sql<{ theme: string }[]>`
      select theme from "user" where id = ${userId}
    `;
    expect(rows[0]?.theme).toBe('dark');
  });

  it.each([
    ['an unknown theme', { theme: 'sepia' }],
    ['a display name', { theme: 'dark', displayName: 'Someone Else' }],
    ['an email', { theme: 'dark', email: 'hijack@example.test' }],
    ['an id', { theme: 'dark', id: '0199bb3b-0000-7000-8000-00000000ffff' }],
    ['an empty body', {}],
  ])('rejects %s with 422', async (_label, payload) => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload,
      ...withSessionCookie(cookie),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('leaves the other fields untouched after a rejected patch', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark', displayName: 'Someone Else' },
      ...withSessionCookie(cookie),
    });

    const rows = await handle.sql<{ display_name: string; theme: string }[]>`
      select display_name, theme from "user" where id = ${userId}
    `;
    expect(rows[0]?.display_name).toBe('Ada Lovelace');
    expect(rows[0]?.theme).toBe('system');
  });

  it('returns 401 without a session', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { theme: 'dark' },
    });

    expect(response.statusCode).toBe(401);
  });
});
