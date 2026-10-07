import { POSITION_STEP } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import {
  as,
  createBoardAs,
  insertCard,
  insertList,
  signUp,
  type TestAccount,
} from './helpers/boards.js';

/** FB-05 AC 2, 3 and 4: `PATCH /v1/lists/{id}` (L-02, L-03, L-04, CL-E23). */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;
let listId: string;
let listUpdatedAt: string;

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
  boardId = await createBoardAs(app, owner, 'Lists board');

  const created = await app.inject({
    method: 'POST',
    url: `/v1/boards/${boardId}/lists`,
    payload: { name: 'Review' },
    ...as(owner),
  });

  const list = created.json<{ id: string; updatedAt: string }>();
  listId = list.id;
  listUpdatedAt = list.updatedAt;
});

async function patch(
  payload: Record<string, unknown>,
  options: { ifMatch?: string; account?: TestAccount } = {},
) {
  const account = options.account ?? owner;

  return app.inject({
    method: 'PATCH',
    url: `/v1/lists/${listId}`,
    payload,
    ...as(account),
    ...(options.ifMatch === undefined ? {} : { headers: { 'if-match': options.ifMatch } }),
  });
}

describe('rename (AC 2, L-02)', () => {
  it('renames the list and moves updatedAt', async () => {
    const response = await patch({ name: 'In review' });

    expect(response.statusCode).toBe(200);

    const list = response.json<{ name: string; updatedAt: string }>();

    expect(list.name).toBe('In review');
    expect(new Date(list.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(listUpdatedAt).getTime(),
    );
    expect(list.updatedAt).not.toBe(listUpdatedAt);
  });

  it('trims the name and refuses blank or over-long with 422', async () => {
    expect((await patch({ name: '  Doing  ' })).json<{ name: string }>().name).toBe('Doing');

    for (const name of ['', '   ', 'x'.repeat(81)]) {
      expect((await patch({ name })).statusCode).toBe(422);
    }
  });

  it('refuses an empty body with 422', async () => {
    expect((await patch({})).statusCode).toBe(422);
  });
});

describe('If-Match (AC 2, CL-E23)', () => {
  it('succeeds with a matching header', async () => {
    const response = await patch({ name: 'Matched' }, { ifMatch: listUpdatedAt });

    expect(response.statusCode).toBe(200);
  });

  it('returns 409 stale with an outdated header', async () => {
    // Someone else edits the list, moving `updatedAt` past what we hold.
    await patch({ name: 'Edited elsewhere' });

    const response = await patch({ name: 'Mine' }, { ifMatch: listUpdatedAt });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('stale');
  });

  it('leaves the list untouched when it refuses a stale write', async () => {
    await patch({ name: 'Edited elsewhere' });
    await patch({ name: 'Mine' }, { ifMatch: listUpdatedAt });

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(owner),
    });

    const names = hydration.json<{ lists: { name: string }[] }>().lists.map((list) => list.name);

    expect(names).toContain('Edited elsewhere');
    expect(names).not.toContain('Mine');
  });

  it('succeeds with no header at all (optional in MVP-2)', async () => {
    expect((await patch({ name: 'Unconditional' })).statusCode).toBe(200);
  });

  it('tolerates ETag quoting around the value', async () => {
    const response = await patch({ name: 'Quoted' }, { ifMatch: `"${listUpdatedAt}"` });

    expect(response.statusCode).toBe(200);
  });
});

describe('reposition (AC 3, L-03)', () => {
  it('places the list between its neighbours in the next hydration', async () => {
    const response = await patch({ position: 1536 });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ position: number }>().position).toBe(1536);

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(owner),
    });

    const names = hydration.json<{ lists: { name: string }[] }>().lists.map((list) => list.name);

    // Defaults sit at 1024 (To Do), 2048 (Doing), 3072 (Done).
    expect(names).toStrictEqual(['To Do', 'Review', 'Doing', 'Done']);
  });

  it('refuses a non-positive or non-finite position with 422', async () => {
    for (const position of [0, -1, 'NaN']) {
      expect((await patch({ position })).statusCode).toBe(422);
    }
  });

  it('accepts a position equal to another list, and hydration breaks the tie by id', async () => {
    // AC 3: last write wins, and the order is then deterministic by `(position, id)`.
    const response = await patch({ position: 2 * POSITION_STEP });

    expect(response.statusCode).toBe(200);

    const first = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });
    const second = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });

    const idsOf = (response: { json: <T>() => T }) =>
      response.json<{ lists: { id: string }[] }>().lists.map((list) => list.id);

    // Stable across calls, which is what ordering by `(position, id)` buys.
    expect(idsOf(first)).toStrictEqual(idsOf(second));
  });

  it('bumps updatedAt on a position-only patch (FB-05 §6)', async () => {
    const response = await patch({ position: 1536 });

    expect(response.json<{ updatedAt: string }>().updatedAt).not.toBe(listUpdatedAt);
  });
});

describe('WIP limit (AC 4, L-04, CL-D4, CL-E33)', () => {
  it('stores a limit and clears it with null', async () => {
    expect((await patch({ wipLimit: 3 })).json<{ wipLimit: number | null }>().wipLimit).toBe(3);
    expect(
      (await patch({ wipLimit: null })).json<{ wipLimit: number | null }>().wipLimit,
    ).toBeNull();
  });

  it('accepts the bounds 1 and 999', async () => {
    expect((await patch({ wipLimit: 1 })).statusCode).toBe(200);
    expect((await patch({ wipLimit: 999 })).statusCode).toBe(200);
  });

  it('refuses 0, a negative, a fraction and 1000 with 422', async () => {
    for (const wipLimit of [0, -1, 2.5, 1000]) {
      expect((await patch({ wipLimit })).statusCode).toBe(422);
    }
  });

  it('is advisory: a list may hold more cards than its limit (CL-D4)', async () => {
    await patch({ wipLimit: 1 });

    // FB-06 owns the card move route; until then the rows are inserted
    // directly, which is what AC 4 asks for.
    await insertCard(handle, listId, { title: 'A', position: 1024, createdBy: owner.userId });
    await insertCard(handle, listId, { title: 'B', position: 2048, createdBy: owner.userId });
    await insertCard(handle, listId, { title: 'C', position: 3072, createdBy: owner.userId });

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(owner),
    });

    const list = hydration
      .json<{ lists: { id: string; wipLimit: number | null; cards: unknown[] }[] }>()
      .lists.find((entry) => entry.id === listId);

    // Over the limit and still served: nothing server-side rejected the cards.
    expect(list?.wipLimit).toBe(1);
    expect(list?.cards).toHaveLength(3);
  });
});

describe('an archived list (AC 9)', () => {
  it('returns 404 on patch', async () => {
    const archivedId = await insertList(handle, boardId, {
      name: 'Gone',
      position: 9999,
      archived: true,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/lists/${archivedId}`,
      payload: { name: 'Back' },
      ...as(owner),
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for a list id that does not exist', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/lists/3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f',
      payload: { name: 'Nope' },
      ...as(owner),
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 422 for an id that is not a uuid', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/lists/not-a-uuid',
      payload: { name: 'Nope' },
      ...as(owner),
    });

    expect(response.statusCode).toBe(422);
  });
});
