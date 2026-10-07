import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertCard, signUp, type TestAccount } from './helpers/boards.js';

/**
 * FB-05 AC 6: `POST /v1/lists/{id}/archive-cards` empties a list but keeps the
 * list itself (L-06a, CL-E24, CL-E34).
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;
let listId: string;

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
});

/**
 * A `timestamptz` as a comparable ISO string. The raw `postgres` driver hands
 * back a string here while Drizzle hands back a `Date`.
 */
function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function archiveCards() {
  return app.inject({
    method: 'POST',
    url: `/v1/lists/${listId}/archive-cards`,
    ...as(owner),
  });
}

async function seedCards(count: number): Promise<string[]> {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    ids.push(
      await insertCard(handle, listId, {
        title: `Card ${index}`,
        position: (index + 1) * 1024,
        createdBy: owner.userId,
      }),
    );
  }

  return ids;
}

describe('POST /v1/lists/{id}/archive-cards (AC 6)', () => {
  it('returns the archived card ids and empties the list in hydration', async () => {
    const seeded = await seedCards(3);

    const response = await archiveCards();

    expect(response.statusCode).toBe(200);
    expect(response.json<{ archivedCardIds: string[] }>().archivedCardIds.sort()).toStrictEqual(
      [...seeded].sort(),
    );

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(owner),
    });

    const list = hydration
      .json<{ lists: { id: string; cards: unknown[] }[] }>()
      .lists.find((entry) => entry.id === listId);

    expect(list?.cards).toStrictEqual([]);
  });

  it('leaves the list itself live on the board', async () => {
    await seedCards(2);
    await archiveCards();

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(owner),
    });

    const ids = hydration.json<{ lists: { id: string }[] }>().lists.map((list) => list.id);

    expect(ids).toContain(listId);
  });

  it('writes one card.archived with via "archive_all" per card', async () => {
    const seeded = await seedCards(2);

    await archiveCards();

    for (const cardId of seeded) {
      const events = await handle.sql<{ payload: { via?: string } }[]>`
        select payload from activity_event where card_id = ${cardId} and type = 'card.archived'
      `;

      expect(events).toHaveLength(1);
      expect(events[0]?.payload.via).toBe('archive_all');
    }
  });

  it('drops the sidebar card count accordingly (CL-E17)', async () => {
    await seedCards(3);

    const before = await app.inject({ method: 'GET', url: '/v1/boards', ...as(owner) });

    await archiveCards();

    const after = await app.inject({ method: 'GET', url: '/v1/boards', ...as(owner) });

    const countOf = (response: { json: <T>() => T }) =>
      response
        .json<{ items: { id: string; cardCount: number }[] }>()
        .items.find((item) => item.id === boardId)?.cardCount;

    expect(countOf(before)).toBe(3);
    expect(countOf(after)).toBe(0);
  });

  it('leaves a card archived earlier untouched and writes it no event', async () => {
    const earlier = await insertCard(handle, listId, {
      title: 'Earlier',
      position: 512,
      createdBy: owner.userId,
      archived: true,
    });

    const [before] = await handle.sql<{ archived_at: Date | string }[]>`
      select archived_at from card where id = ${earlier}
    `;

    await seedCards(1);

    const response = await archiveCards();

    expect(response.json<{ archivedCardIds: string[] }>().archivedCardIds).not.toContain(earlier);

    const [after] = await handle.sql<{ archived_at: Date | string }[]>`
      select archived_at from card where id = ${earlier}
    `;

    expect(iso(after?.archived_at)).toBe(iso(before?.archived_at));

    const events = await handle.sql<{ id: string }[]>`
      select id from activity_event where card_id = ${earlier}
    `;

    expect(events).toHaveLength(0);
  });

  it('is a 200 with an empty array on an already empty list', async () => {
    const response = await archiveCards();

    expect(response.statusCode).toBe(200);
    expect(response.json<{ archivedCardIds: string[] }>().archivedCardIds).toStrictEqual([]);
  });

  it('is idempotent: a second call archives nothing more', async () => {
    await seedCards(2);

    await archiveCards();
    const second = await archiveCards();

    expect(second.json<{ archivedCardIds: string[] }>().archivedCardIds).toStrictEqual([]);
  });

  it('returns 404 for a list that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/lists/3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f/archive-cards',
      ...as(owner),
    });

    expect(response.statusCode).toBe(404);
  });
});
