import { POSITION_STEP } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import {
  addBoardMember,
  addWorkspaceMember,
  as,
  createBoardAs,
  insertCard,
  insertList,
  signUp,
  type TestAccount,
} from './helpers/boards.js';

/**
 * `GET /v1/boards` (FB-04 §10 integration row 2): visibility, ordering, the
 * card count excluding archived rows, and pagination. Covers AC 2 and AC 3.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;

interface ListResponse {
  items: {
    id: string;
    name: string;
    starred: boolean;
    cardCount: number;
    workspaceId: string;
    color: string;
    archivedAt: string | null;
    updatedAt: string;
  }[];
  nextCursor: string | null;
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
});

async function list(account: TestAccount, query = ''): Promise<ListResponse> {
  const response = await app.inject({ method: 'GET', url: `/v1/boards${query}`, ...as(account) });

  expect(response.statusCode).toBe(200);

  return response.json<ListResponse>();
}

async function star(account: TestAccount, boardId: string): Promise<void> {
  const response = await app.inject({
    method: 'PATCH',
    url: `/v1/boards/${boardId}`,
    payload: { starred: true },
    ...as(account),
  });

  expect(response.statusCode).toBe(200);
}

describe('GET /v1/boards shape and ordering (AC 2)', () => {
  it('returns every field the sidebar row needs', async () => {
    await createBoardAs(app, owner, 'Launch');

    const { items } = await list(owner);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'Launch',
      starred: false,
      cardCount: 0,
      workspaceId: owner.workspaceId,
      archivedAt: null,
    });
    expect(items[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(typeof items[0]?.updatedAt).toBe('string');
  });

  it('orders starred first, then by name case-insensitively', async () => {
    await createBoardAs(app, owner, 'banana');
    await createBoardAs(app, owner, 'Apple');
    const zebra = await createBoardAs(app, owner, 'Zebra');
    await createBoardAs(app, owner, 'cherry');

    await star(owner, zebra);

    const { items } = await list(owner);

    expect(items.map((item) => item.name)).toEqual(['Zebra', 'Apple', 'banana', 'cherry']);
    expect(items[0]?.starred).toBe(true);
  });

  it('counts non-archived cards on non-archived lists only (CL-E17)', async () => {
    const boardId = await createBoardAs(app, owner, 'Counted');

    const liveList = await insertList(handle, boardId, {
      name: 'Live',
      position: POSITION_STEP * 9,
    });
    const archivedList = await insertList(handle, boardId, {
      name: 'Archived list',
      position: POSITION_STEP * 10,
      archived: true,
    });

    await insertCard(handle, liveList, { title: 'A', position: 1024, createdBy: owner.userId });
    await insertCard(handle, liveList, { title: 'B', position: 2048, createdBy: owner.userId });
    // Excluded: archived card on a live list.
    await insertCard(handle, liveList, {
      title: 'Archived card',
      position: 3072,
      createdBy: owner.userId,
      archived: true,
    });
    // Excluded: live card on an archived list.
    await insertCard(handle, archivedList, {
      title: 'Hidden',
      position: 1024,
      createdBy: owner.userId,
    });

    const { items } = await list(owner);

    expect(items[0]?.cardCount).toBe(2);
  });

  it('omits archived boards (CL-E16)', async () => {
    const kept = await createBoardAs(app, owner, 'Kept');
    const archived = await createBoardAs(app, owner, 'Archived');

    await app.inject({
      method: 'PATCH',
      url: `/v1/boards/${archived}`,
      payload: { archived: true },
      ...as(owner),
    });

    const { items } = await list(owner);

    expect(items.map((item) => item.id)).toEqual([kept]);
  });

  it('returns an empty page with a null cursor for a workspace with no boards', async () => {
    expect(await list(owner)).toEqual({ items: [], nextCursor: null });
  });
});

describe('GET /v1/boards visibility (AC 2, AC 8, CL-E17)', () => {
  it('shows a board to its members of every role', async () => {
    const boardId = await createBoardAs(app, owner, 'Shared');

    const member = await signUp(app, 'Omar Haddad');
    const observer = await signUp(app, 'Priya Nair');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addWorkspaceMember(handle, owner.workspaceId, observer.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');
    await addBoardMember(handle, boardId, observer.userId, 'observer');

    expect((await list(member)).items.map((item) => item.id)).toEqual([boardId]);
    expect((await list(observer)).items.map((item) => item.id)).toEqual([boardId]);
  });

  it('hides a board from a workspace member who is not on it', async () => {
    await createBoardAs(app, owner, 'Private');

    const outsider = await signUp(app, 'Tom Becker');
    await addWorkspaceMember(handle, owner.workspaceId, outsider.userId, 'member');

    expect((await list(outsider)).items).toEqual([]);
  });

  it('shows every board in the workspace to a workspace admin who is not a member', async () => {
    const boardId = await createBoardAs(app, owner, 'Private');

    const admin = await signUp(app, 'Lena Fischer');
    await addWorkspaceMember(handle, owner.workspaceId, admin.userId, 'admin');

    expect((await list(admin)).items.map((item) => item.id)).toEqual([boardId]);
  });

  it('never shows a board from another workspace', async () => {
    await createBoardAs(app, owner, 'Ours');

    const stranger = await signUp(app, 'Grace Hopper');

    expect((await list(stranger)).items).toEqual([]);
  });

  it('computes starred per user, not per board (CL-E14)', async () => {
    const boardId = await createBoardAs(app, owner, 'Shared');

    const member = await signUp(app, 'Omar Haddad');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');

    await star(owner, boardId);

    expect((await list(owner)).items[0]?.starred).toBe(true);
    expect((await list(member)).items[0]?.starred).toBe(false);
  });

  it('refuses an unauthenticated request with 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/boards' });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /v1/boards pagination (AC 3)', () => {
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

  beforeEach(async () => {
    for (const name of names) await createBoardAs(app, owner, name);
  });

  it('walks every board exactly once across pages and ends with a null cursor', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const query: string =
        cursor === null ? '?limit=2' : `?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const page: ListResponse = await list(owner, query);

      seen.push(...page.items.map((item) => item.name));
      cursor = page.nextCursor;
      pages += 1;

      expect(pages).toBeLessThan(10);
    } while (cursor !== null);

    expect(seen).toEqual(names);
    expect(pages).toBe(3);
  });

  it('returns a null cursor when the last page is exactly full', async () => {
    const page = await list(owner, '?limit=5');

    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('defaults to 50 and keeps starred boards first across a page boundary', async () => {
    await star(owner, (await list(owner)).items.find((item) => item.name === 'echo')?.id ?? '');

    const first = await list(owner, '?limit=2');

    expect(first.items.map((item) => item.name)).toEqual(['echo', 'alpha']);

    const second = await list(
      owner,
      `?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
    );

    expect(second.items.map((item) => item.name)).toEqual(['bravo', 'charlie']);
  });

  it('rejects a limit above 200, below 1, or not a number, with 422', async () => {
    for (const limit of ['201', '0', 'many']) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/boards?limit=${limit}`,
        ...as(owner),
      });

      expect(response.statusCode, `limit=${limit}`).toBe(422);
    }
  });

  it('rejects a cursor this service did not produce, with 422 rather than 500', async () => {
    for (const cursor of ['not-a-cursor', Buffer.from('[9,"a","b"]').toString('base64url')]) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/boards?cursor=${encodeURIComponent(cursor)}`,
        ...as(owner),
      });

      expect(response.statusCode, cursor).toBe(422);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_failed');
    }
  });
});
