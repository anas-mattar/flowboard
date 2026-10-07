import { POSITION_STEP } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertCard, signUp, type TestAccount } from './helpers/boards.js';

/**
 * FB-05 AC 5: `POST /v1/lists/{id}/sort-by-due` (L-05, CL-A14, CL-E35).
 *
 * The fixture is the one the acceptance criterion names: A (10 Oct), B
 * (12 Oct), C (11 Oct), D (no date), E (12 Oct) in rank order 1 to 5, which
 * must come back as A, C, B, E, D — B before E because the sort is stable.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;
let listId: string;
let cards: Record<'A' | 'B' | 'C' | 'D' | 'E', string>;

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

  listId = created.json<{ id: string }>().id;

  const seed = async (title: string, rank: number, dueAt: string | null) =>
    insertCard(handle, listId, {
      title,
      position: rank * POSITION_STEP,
      createdBy: owner.userId,
      dueAt,
    });

  cards = {
    A: await seed('A', 1, '2026-10-10T09:00:00.000Z'),
    B: await seed('B', 2, '2026-10-12T09:00:00.000Z'),
    C: await seed('C', 3, '2026-10-11T09:00:00.000Z'),
    D: await seed('D', 4, null),
    E: await seed('E', 5, '2026-10-12T09:00:00.000Z'),
  };
});

function sortByDue() {
  return app.inject({
    method: 'POST',
    url: `/v1/lists/${listId}/sort-by-due`,
    ...as(owner),
  });
}

/** The list's cards as the next hydration orders them. */
async function hydratedCards(): Promise<{ id: string; title: string; position: number }[]> {
  const hydration = await app.inject({
    method: 'GET',
    url: `/v1/boards/${boardId}`,
    ...as(owner),
  });

  return (
    hydration
      .json<{ lists: { id: string; cards: { id: string; title: string; position: number }[] }[] }>()
      .lists.find((list) => list.id === listId)?.cards ?? []
  );
}

async function movedEvents(cardId: string) {
  return handle.sql<{ payload: Record<string, unknown> }[]>`
    select payload from activity_event where card_id = ${cardId} and type = 'card.moved'
  `;
}

describe('POST /v1/lists/{id}/sort-by-due (AC 5)', () => {
  it('orders the fixture A, C, B, E, D with B before E (stable)', async () => {
    const response = await sortByDue();

    expect(response.statusCode).toBe(200);

    const titles = (await hydratedCards()).map((card) => card.title);

    expect(titles).toStrictEqual(['A', 'C', 'B', 'E', 'D']);
  });

  it('rewrites positions to 1024, 2048, 3072, 4096, 5120', async () => {
    await sortByDue();

    expect((await hydratedCards()).map((card) => card.position)).toStrictEqual([
      1024, 2048, 3072, 4096, 5120,
    ]);
  });

  it('returns movedCardIds [C, B, E, D] — the cards whose rank changed', async () => {
    const response = await sortByDue();

    expect(response.json<{ movedCardIds: string[] }>().movedCardIds).toStrictEqual([
      cards.C,
      cards.B,
      cards.E,
      cards.D,
    ]);
  });

  it('writes exactly one card.moved with via "sort" for each moved card', async () => {
    await sortByDue();

    for (const key of ['C', 'B', 'E', 'D'] as const) {
      const events = await movedEvents(cards[key]);

      expect(events).toHaveLength(1);
      expect(events[0]?.payload['via']).toBe('sort');
      // A sort never leaves the list (CL-E35).
      expect(events[0]?.payload['fromListId']).toBe(listId);
      expect(events[0]?.payload['toListId']).toBe(listId);
    }
  });

  it('writes no event for A, whose rank is unchanged though its position is rewritten', async () => {
    await sortByDue();

    expect(await movedEvents(cards.A)).toHaveLength(0);

    // Its position was still rewritten as part of the re-balance.
    const a = (await hydratedCards()).find((card) => card.id === cards.A);
    expect(a?.position).toBe(1024);
  });

  it('records the real from and to positions on a moved card', async () => {
    await sortByDue();

    const [event] = await movedEvents(cards.C);

    // C started at rank 3 (3072) and ends at rank 2 (2048).
    expect(event?.payload['fromPosition']).toBe(3 * POSITION_STEP);
    expect(event?.payload['toPosition']).toBe(2 * POSITION_STEP);
  });

  it('is idempotent: a second call moves nothing and writes no event', async () => {
    await sortByDue();

    const eventsAfterFirst = await handle.sql<{ count: string }[]>`
      select count(*)::text as count from activity_event where type = 'card.moved'
    `;

    const second = await sortByDue();

    expect(second.statusCode).toBe(200);
    expect(second.json<{ movedCardIds: string[] }>().movedCardIds).toStrictEqual([]);

    const eventsAfterSecond = await handle.sql<{ count: string }[]>`
      select count(*)::text as count from activity_event where type = 'card.moved'
    `;

    expect(eventsAfterSecond[0]?.count).toBe(eventsAfterFirst[0]?.count);
    expect((await hydratedCards()).map((card) => card.title)).toStrictEqual([
      'A',
      'C',
      'B',
      'E',
      'D',
    ]);
  });

  it('ignores archived cards', async () => {
    await insertCard(handle, listId, {
      title: 'Archived',
      position: 100,
      createdBy: owner.userId,
      dueAt: '2026-01-01T09:00:00.000Z',
      archived: true,
    });

    await sortByDue();

    // Despite the earliest due date, it does not appear at the front.
    expect((await hydratedCards()).map((card) => card.title)).toStrictEqual([
      'A',
      'C',
      'B',
      'E',
      'D',
    ]);
  });

  it('is a 200 with an empty result on a list with no cards', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/lists`,
      payload: { name: 'Empty' },
      ...as(owner),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/lists/${empty.json<{ id: string }>().id}/sort-by-due`,
      ...as(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ movedCardIds: string[] }>().movedCardIds).toStrictEqual([]);
  });

  it('puts every undated card last, in their previous relative order', async () => {
    await handle.sql`delete from card where list_id = ${listId}`;

    const first = await insertCard(handle, listId, {
      title: 'Undated first',
      position: 1024,
      createdBy: owner.userId,
    });
    const second = await insertCard(handle, listId, {
      title: 'Undated second',
      position: 2048,
      createdBy: owner.userId,
    });
    const dated = await insertCard(handle, listId, {
      title: 'Dated',
      position: 3072,
      createdBy: owner.userId,
      dueAt: '2026-10-10T09:00:00.000Z',
    });

    await sortByDue();

    expect((await hydratedCards()).map((card) => card.id)).toStrictEqual([dated, first, second]);
  });

  it('returns 404 for a list that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/lists/3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f/sort-by-due',
      ...as(owner),
    });

    expect(response.statusCode).toBe(404);
  });
});
