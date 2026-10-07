import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertCard, signUp, type TestAccount } from './helpers/boards.js';

/**
 * FB-05 AC 7: `DELETE /v1/lists/{id}` archives the list and its live cards with
 * **one shared timestamp** and one `card.archived { via: "list_archived" }` per
 * card (L-06b, CL-E2, CL-E34).
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
 * back a string here while Drizzle hands back a `Date`, so both are normalised
 * rather than assuming either.
 */
function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** `archived_at` of a list and of every card on it, as ISO strings. */
async function archivedTimestamps(): Promise<{
  list: string | null;
  cards: { id: string; archivedAt: string | null }[];
}> {
  const [list] = await handle.sql<{ archived_at: Date | string | null }[]>`
    select archived_at from list where id = ${listId}
  `;

  const cards = await handle.sql<{ id: string; archived_at: Date | string | null }[]>`
    select id, archived_at from card where list_id = ${listId} order by position
  `;

  return {
    list: iso(list?.archived_at),
    cards: cards.map((card) => ({ id: card.id, archivedAt: iso(card.archived_at) })),
  };
}

async function archiveEvents(cardId: string) {
  return handle.sql<{ type: string; payload: { via?: string } }[]>`
    select type, payload from activity_event where card_id = ${cardId} and type = 'card.archived'
  `;
}

describe('DELETE /v1/lists/{id} (AC 7)', () => {
  it('returns 204 and removes the list from the next hydration', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/lists/${listId}`,
      ...as(owner),
    });

    expect(response.statusCode).toBe(204);

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(owner),
    });

    const ids = hydration.json<{ lists: { id: string }[] }>().lists.map((list) => list.id);

    expect(ids).not.toContain(listId);
  });

  it('archives the list and every live card at the same instant', async () => {
    await insertCard(handle, listId, { title: 'A', position: 1024, createdBy: owner.userId });
    await insertCard(handle, listId, { title: 'B', position: 2048, createdBy: owner.userId });

    await app.inject({ method: 'DELETE', url: `/v1/lists/${listId}`, ...as(owner) });

    const { list, cards } = await archivedTimestamps();

    expect(list).not.toBeNull();
    expect(cards).toHaveLength(2);

    // The assertion AC 7 is about: one timestamp, shared exactly, so FB-17 can
    // restore the delete as a single unit.
    for (const card of cards) {
      expect(card.archivedAt).toBe(list);
    }
  });

  it('writes one card.archived with via "list_archived" per card', async () => {
    const cardA = await insertCard(handle, listId, {
      title: 'A',
      position: 1024,
      createdBy: owner.userId,
    });
    const cardB = await insertCard(handle, listId, {
      title: 'B',
      position: 2048,
      createdBy: owner.userId,
    });

    await app.inject({ method: 'DELETE', url: `/v1/lists/${listId}`, ...as(owner) });

    for (const cardId of [cardA, cardB]) {
      const events = await archiveEvents(cardId);

      expect(events).toHaveLength(1);
      expect(events[0]?.payload.via).toBe('list_archived');
    }
  });

  it('leaves a card archived earlier with its own, earlier timestamp', async () => {
    const live = await insertCard(handle, listId, {
      title: 'Live',
      position: 1024,
      createdBy: owner.userId,
    });
    const earlier = await insertCard(handle, listId, {
      title: 'Earlier',
      position: 2048,
      createdBy: owner.userId,
      archived: true,
    });

    const [before] = await handle.sql<{ archived_at: Date | string }[]>`
      select archived_at from card where id = ${earlier}
    `;

    await app.inject({ method: 'DELETE', url: `/v1/lists/${listId}`, ...as(owner) });

    const { list, cards } = await archivedTimestamps();

    const earlierAfter = cards.find((card) => card.id === earlier);
    const liveAfter = cards.find((card) => card.id === live);

    // Untouched: its original timestamp survives the delete.
    expect(earlierAfter?.archivedAt).toBe(iso(before?.archived_at));
    expect(earlierAfter?.archivedAt).not.toBe(list);
    // The live card picked up the delete's shared timestamp.
    expect(liveAfter?.archivedAt).toBe(list);
  });

  it('writes no event for a card that was already archived', async () => {
    const earlier = await insertCard(handle, listId, {
      title: 'Earlier',
      position: 1024,
      createdBy: owner.userId,
      archived: true,
    });

    await app.inject({ method: 'DELETE', url: `/v1/lists/${listId}`, ...as(owner) });

    expect(await archiveEvents(earlier)).toHaveLength(0);
  });

  it('returns 404 on a second delete', async () => {
    const first = await app.inject({
      method: 'DELETE',
      url: `/v1/lists/${listId}`,
      ...as(owner),
    });
    const second = await app.inject({
      method: 'DELETE',
      url: `/v1/lists/${listId}`,
      ...as(owner),
    });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(404);
  });

  it('deletes an empty list without writing any event', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/lists/${listId}`,
      ...as(owner),
    });

    const events = await handle.sql<{ count: string }[]>`
      select count(*)::text as count from activity_event
    `;

    expect(response.statusCode).toBe(204);
    expect(events[0]?.count).toBe('0');
  });

  it('honours a stale If-Match with 409 and does not archive anything', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/lists`,
      payload: { name: 'Conditional' },
      ...as(owner),
    });

    const list = created.json<{ id: string; updatedAt: string }>();

    await app.inject({
      method: 'PATCH',
      url: `/v1/lists/${list.id}`,
      payload: { name: 'Edited elsewhere' },
      ...as(owner),
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/lists/${list.id}`,
      headers: { 'if-match': list.updatedAt },
      ...as(owner),
    });

    expect(response.statusCode).toBe(409);

    const [row] = await handle.sql<{ archived_at: Date | null }[]>`
      select archived_at from list where id = ${list.id}
    `;

    expect(row?.archived_at).toBeNull();
  });
});
