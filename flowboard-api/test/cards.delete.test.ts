import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, signUp, type TestAccount } from './helpers/boards.js';
import { createCardAs, createListAs, storedActivity } from './helpers/cards.js';

/** FB-06 AC 7: `DELETE /v1/cards/{id}` (C-13, CL-A2). */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;
let listId: string;
let cardId: string;
let cardUpdatedAt: string;

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
  boardId = await createBoardAs(app, owner, 'Delete board');
  listId = await createListAs(app, owner, boardId, 'To Do');

  const card = await createCardAs(app, owner, listId, 'Write launch post');
  cardId = card.id;
  cardUpdatedAt = card.updatedAt;
});

function remove(options: { ifMatch?: string; target?: string } = {}) {
  return app.inject({
    method: 'DELETE',
    url: `/v1/cards/${options.target ?? cardId}`,
    ...as(owner),
    ...(options.ifMatch === undefined ? {} : { headers: { 'if-match': options.ifMatch } }),
  });
}

describe('archiving a card (AC 7, C-13, CL-A2)', () => {
  it('returns 204 and sets archived_at rather than deleting the row', async () => {
    const response = await remove();

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    const rows = (await handle.sql`
      select archived_at from card where id = ${cardId}
    `) as unknown as { archived_at: Date | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.archived_at).not.toBeNull();
  });

  it('writes card.archived { via: "card" }', async () => {
    await remove();

    const events = await storedActivity(handle, cardId);

    expect(events[0]?.type).toBe('card.archived');
    expect(events[0]?.payload).toStrictEqual({ via: 'card' });
    expect(events[0]?.actor_id).toBe(owner.userId);
  });

  it('removes the card from the next hydration', async () => {
    await createCardAs(app, owner, listId, 'Survivor');
    await remove();

    const board = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });
    const cards = board
      .json<{ lists: { id: string; cards: { title: string }[] }[] }>()
      .lists.find((list) => list.id === listId)?.cards;

    expect(cards?.map((card) => card.title)).toStrictEqual(['Survivor']);
  });

  it('removes the card from the sidebar count (CL-E17)', async () => {
    async function sidebarCount() {
      const response = await app.inject({ method: 'GET', url: '/v1/boards', ...as(owner) });

      return response
        .json<{ items: { id: string; cardCount: number }[] }>()
        .items.find((board) => board.id === boardId)?.cardCount;
    }

    expect(await sidebarCount()).toBe(1);

    await remove();

    expect(await sidebarCount()).toBe(0);
  });
});

describe('a second delete (AC 7)', () => {
  it('returns 404 and writes no second event', async () => {
    expect((await remove()).statusCode).toBe(204);

    const second = await remove();

    expect(second.statusCode).toBe(404);
    expect(second.json<{ error: { code: string } }>().error.code).toBe('not_found');

    const archived = (await storedActivity(handle, cardId)).filter(
      (event) => event.type === 'card.archived',
    );

    expect(archived).toHaveLength(1);
  });
});

describe('the archived card afterwards (AC 2, AC 7)', () => {
  it('follows AC 2: readable by the board admin with archivedAt set', async () => {
    await remove();

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ archivedAt: string | null }>().archivedAt).not.toBeNull();
  });
});

describe('If-Match (AC 7, CL-E23)', () => {
  it('succeeds with a matching header and with no header', async () => {
    expect((await remove({ ifMatch: cardUpdatedAt })).statusCode).toBe(204);

    const second = await createCardAs(app, owner, listId, 'Second');

    expect((await remove({ target: second.id })).statusCode).toBe(204);
  });

  it('returns 409 and archives nothing when the header is stale', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { title: 'Renamed first' },
      ...as(owner),
    });

    const response = await remove({ ifMatch: cardUpdatedAt });

    expect(response.statusCode).toBe(409);

    const rows = (await handle.sql`
      select archived_at from card where id = ${cardId}
    `) as unknown as { archived_at: Date | null }[];

    expect(rows[0]?.archived_at).toBeNull();
  });
});

describe('authorisation (AC 7, AC 9)', () => {
  it('returns 404 for a card that does not exist', async () => {
    expect((await remove({ target: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await app.inject({ method: 'DELETE', url: `/v1/cards/${cardId}` });

    expect(response.statusCode).toBe(401);
  });
});
