import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import {
  addBoardMember,
  addWorkspaceMember,
  as,
  createBoardAs,
  signUp,
  type TestAccount,
} from './helpers/boards.js';

/**
 * `PATCH /v1/boards/{id}` (FB-04 §10 integration row 4): rename with
 * `If-Match`, the `409`, the per-user star, archive and unarchive, and
 * validation. Covers AC 5, AC 6 and AC 7.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;

interface Summary {
  id: string;
  name: string;
  color: string;
  starred: boolean;
  cardCount: number;
  archivedAt: string | null;
  updatedAt: string;
}

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
  owner = await signUp(app, 'Ada Lovelace');
  boardId = await createBoardAs(app, owner, 'Launch');
});

async function patch(
  payload: Record<string, unknown>,
  account: TestAccount = owner,
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  // Awaited rather than returned directly so the inferred type is the reply,
  // not Fastify's chainable builder.
  return await app.inject({
    method: 'PATCH',
    url: `/v1/boards/${boardId}`,
    payload,
    headers,
    ...as(account),
  });
}

async function currentUpdatedAt(): Promise<string> {
  const response = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });

  return response.json<{ board: { updatedAt: string } }>().board.updatedAt;
}

describe('PATCH rename and If-Match (AC 5, FS §7.1, CL-E18)', () => {
  it('renames the board and returns a newer updatedAt', async () => {
    const before = await currentUpdatedAt();

    const response = await patch({ name: 'Renamed' });

    expect(response.statusCode).toBe(200);

    const json = response.json<Summary>();
    expect(json.name).toBe('Renamed');
    expect(new Date(json.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    expect(json.updatedAt).not.toBe(before);
  });

  it('succeeds with a matching If-Match', async () => {
    const response = await patch({ name: 'Matched' }, owner, {
      'if-match': await currentUpdatedAt(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().name).toBe('Matched');
  });

  it('accepts an If-Match that an HTTP client has ETag-quoted', async () => {
    const response = await patch({ name: 'Quoted' }, owner, {
      'if-match': `"${await currentUpdatedAt()}"`,
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns 409 stale with a stale If-Match and does not apply the change', async () => {
    const stale = await currentUpdatedAt();

    expect((await patch({ name: 'First' })).statusCode).toBe(200);

    const response = await patch({ name: 'Second' }, owner, { 'if-match': stale });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('stale');

    const after = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });
    expect(after.json<{ board: { name: string } }>().board.name).toBe('First');
  });

  it('succeeds without If-Match, which stays optional in MVP-1 (CL-E18)', async () => {
    expect((await patch({ name: 'No header' })).statusCode).toBe(200);
  });

  it('ignores If-Match when starred is the only field (FB-04 §6)', async () => {
    const stale = await currentUpdatedAt();

    expect((await patch({ name: 'Moved on' })).statusCode).toBe(200);

    // The star cannot move `updatedAt`, so checking it here would make a star
    // impossible to perform after any other edit.
    const response = await patch({ starred: true }, owner, { 'if-match': stale });

    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().starred).toBe(true);
  });

  it('trims the name and refuses one that is blank or too long with 422', async () => {
    expect((await patch({ name: '  Trimmed  ' })).json<Summary>().name).toBe('Trimmed');
    expect((await patch({ name: '   ' })).statusCode).toBe(422);
    expect((await patch({ name: 'a'.repeat(121) })).statusCode).toBe(422);
  });

  it('refuses an empty body and an unknown field with 422', async () => {
    expect((await patch({})).statusCode).toBe(422);
    expect((await patch({ archivedAt: null })).statusCode).toBe(422);
  });

  it('accepts a #rrggbb colour and refuses anything else (CL-E15)', async () => {
    expect((await patch({ color: '#8f5bff' })).json<Summary>().color).toBe('#8f5bff');
    expect((await patch({ color: 'blue' })).statusCode).toBe(422);
    expect((await patch({ color: '#abc' })).statusCode).toBe(422);
  });
});

describe('PATCH starred is per user (AC 6, CL-E14)', () => {
  it('creates a board_star row for the caller only', async () => {
    const member = await signUp(app, 'Omar Haddad');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');

    expect((await patch({ starred: true })).json<Summary>().starred).toBe(true);

    const rows = await handle.sql<{ user_id: string }[]>`
      select user_id from board_star where board_id = ${boardId}
    `;
    expect(rows.map((row) => row.user_id)).toEqual([owner.userId]);

    const asMember = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(member),
    });
    expect(asMember.json<{ starred: boolean }>().starred).toBe(false);
  });

  it('unstars without disturbing another user’s star', async () => {
    const member = await signUp(app, 'Omar Haddad');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');

    await patch({ starred: true });
    await patch({ starred: true }, member);

    expect((await patch({ starred: false })).json<Summary>().starred).toBe(false);

    const rows = await handle.sql<{ user_id: string }[]>`
      select user_id from board_star where board_id = ${boardId}
    `;
    expect(rows.map((row) => row.user_id)).toEqual([member.userId]);
  });

  it('is idempotent, so a retried star is not an error', async () => {
    expect((await patch({ starred: true })).statusCode).toBe(200);
    expect((await patch({ starred: true })).statusCode).toBe(200);

    const rows = await handle.sql<{ count: number }[]>`
      select count(*)::int as count from board_star where board_id = ${boardId}
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it('does not move updatedAt (FB-04 §6)', async () => {
    const before = await currentUpdatedAt();

    await patch({ starred: true });

    expect(await currentUpdatedAt()).toBe(before);
  });

  it('is allowed for every role that can view the board, observers included', async () => {
    const observer = await signUp(app, 'Priya Nair');
    await addWorkspaceMember(handle, owner.workspaceId, observer.userId, 'member');
    await addBoardMember(handle, boardId, observer.userId, 'observer');

    const response = await patch({ starred: true }, observer);

    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().starred).toBe(true);
  });
});

describe('PATCH archive and unarchive (AC 7, CL-E16)', () => {
  it('sets archivedAt and removes the board from GET /v1/boards', async () => {
    const response = await patch({ archived: true });

    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().archivedAt).not.toBeNull();

    const list = await app.inject({ method: 'GET', url: '/v1/boards', ...as(owner) });
    expect(list.json<{ items: unknown[] }>().items).toEqual([]);
  });

  it('clears archivedAt again with archived: false (API only in MVP-1)', async () => {
    await patch({ archived: true });

    const response = await patch({ archived: false });

    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().archivedAt).toBeNull();

    const list = await app.inject({ method: 'GET', url: '/v1/boards', ...as(owner) });
    expect(list.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([
      boardId,
    ]);
  });

  it('leaves the lists and cards untouched so a restore is exact (CL-E16)', async () => {
    await patch({ archived: true });

    const lists = await handle.sql<{ count: number }[]>`
      select count(*)::int as count from list where board_id = ${boardId} and archived_at is not null
    `;
    expect(lists[0]?.count).toBe(0);
  });
});

describe('PATCH authorisation (AC 8)', () => {
  it('refuses a board member and an observer with 403 on name, color and archived', async () => {
    const member = await signUp(app, 'Omar Haddad');
    const observer = await signUp(app, 'Priya Nair');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addWorkspaceMember(handle, owner.workspaceId, observer.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');
    await addBoardMember(handle, boardId, observer.userId, 'observer');

    for (const account of [member, observer]) {
      for (const payload of [{ name: 'Nope' }, { color: '#c9372c' }, { archived: true }]) {
        const response = await patch(payload, account);

        expect(response.statusCode, JSON.stringify(payload)).toBe(403);
        expect(response.json<{ error: { code: string } }>().error.code).toBe('forbidden');
      }
    }
  });

  it('allows a workspace admin who is not a board member', async () => {
    const admin = await signUp(app, 'Lena Fischer');
    await addWorkspaceMember(handle, owner.workspaceId, admin.userId, 'admin');

    const response = await patch({ name: 'Admin renamed' }, admin);

    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().name).toBe('Admin renamed');
  });

  it('returns 404, not 403, to a workspace member who is not on the board', async () => {
    const outsider = await signUp(app, 'Tom Becker');
    await addWorkspaceMember(handle, owner.workspaceId, outsider.userId, 'member');

    expect((await patch({ name: 'Nope' }, outsider)).statusCode).toBe(404);
    expect((await patch({ starred: true }, outsider)).statusCode).toBe(404);
  });

  it('returns 404 to a user from another workspace', async () => {
    const stranger = await signUp(app, 'Grace Hopper');

    expect((await patch({ name: 'Nope' }, stranger)).statusCode).toBe(404);
  });

  it('refuses an unauthenticated request with 401', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/boards/${boardId}`,
      payload: { name: 'Nope' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a cookie-authenticated patch from a foreign Origin (CL-E9)', async () => {
    const response = await patch({ name: 'Nope' }, owner, { origin: 'https://evil.example' });

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('bad_origin');
  });
});
