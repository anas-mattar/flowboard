import { CARD_TITLE_MAX_LENGTH, POSITION_STEP } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertList, signUp, type TestAccount } from './helpers/boards.js';
import { createListAs, storedActivity, storedFunnelEvents } from './helpers/cards.js';

/** FB-06 AC 1: `POST /v1/lists/{id}/cards` (C-01, CL-E40). */

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
  boardId = await createBoardAs(app, owner, 'Cards board');
  listId = await createListAs(app, owner, boardId, 'To Do');
});

async function create(payload: Record<string, unknown>, target = listId) {
  return app.inject({
    method: 'POST',
    url: `/v1/lists/${target}/cards`,
    payload,
    ...as(owner),
  });
}

describe('creating a card (AC 1, C-01)', () => {
  it('returns 201 with a CardSummary at the end of the list', async () => {
    const response = await create({ title: 'Write launch post' });

    expect(response.statusCode).toBe(201);

    const card = response.json<Record<string, unknown>>();

    expect(card['title']).toBe('Write launch post');
    expect(card['listId']).toBe(listId);
    expect(card['position']).toBe(POSITION_STEP);
    expect(card['hasDescription']).toBe(false);
    expect(card['commentCount']).toBe(0);
    expect(card['checklist']).toStrictEqual({ done: 0, total: 0 });
    expect(card['labelIds']).toStrictEqual([]);
    expect(card['memberIds']).toStrictEqual([]);
  });

  it('is the FB-04 CardSummary shape, with no createdBy (CL-E26, CL-E38)', async () => {
    const card = (await create({ title: 'Shape check' })).json<Record<string, unknown>>();

    expect(Object.keys(card).sort()).toStrictEqual(
      [
        'checklist',
        'commentCount',
        'dueAt',
        'dueComplete',
        'hasDescription',
        'id',
        'labelIds',
        'listId',
        'memberIds',
        'position',
        'title',
        'updatedAt',
      ].sort(),
    );
  });

  it('appends each card after the last live one', async () => {
    const first = (await create({ title: 'First' })).json<{ position: number }>();
    const second = (await create({ title: 'Second' })).json<{ position: number }>();
    const third = (await create({ title: 'Third' })).json<{ position: number }>();

    expect(first.position).toBe(POSITION_STEP);
    expect(second.position).toBe(2 * POSITION_STEP);
    expect(third.position).toBe(3 * POSITION_STEP);
  });

  it('ignores archived cards when it computes the end of the list', async () => {
    const first = (await create({ title: 'First' })).json<{ id: string; position: number }>();
    await create({ title: 'Second' });

    await app.inject({ method: 'DELETE', url: `/v1/cards/${first.id}`, ...as(owner) });

    // The live maximum is still the second card's 2048, so the next lands at 3072.
    const third = (await create({ title: 'Third' })).json<{ position: number }>();

    expect(third.position).toBe(3 * POSITION_STEP);
  });

  it('serialises concurrent composer submissions onto distinct positions', async () => {
    const responses = await Promise.all([
      create({ title: 'A' }),
      create({ title: 'B' }),
      create({ title: 'C' }),
    ]);

    const positions = responses.map((response) => response.json<{ position: number }>().position);

    expect(new Set(positions).size).toBe(3);
  });
});

describe('the detail read after creating (AC 1, AC 2)', () => {
  it('reports createdBy as the caller', async () => {
    const { id } = (await create({ title: 'Write launch post' })).json<{ id: string }>();

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${id}`, ...as(owner) });

    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ createdBy: string }>().createdBy).toBe(owner.userId);
  });
});

describe('events (AC 1, FS §5.2, CL-E40)', () => {
  it('writes one card.created activity event carrying the title', async () => {
    const { id } = (await create({ title: 'Write launch post' })).json<{ id: string }>();

    const events = await storedActivity(handle, id);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('card.created');
    expect(events[0]?.payload).toStrictEqual({ title: 'Write launch post' });
    expect(events[0]?.actor_id).toBe(owner.userId);
  });

  it('writes the card.created funnel event with the board and workspace', async () => {
    await create({ title: 'Write launch post' });

    const funnel = await storedFunnelEvents(handle, 'card.created');

    expect(funnel).toHaveLength(1);
    expect(funnel[0]?.payload).toStrictEqual({ boardId, workspaceId: owner.workspaceId });
    expect(funnel[0]?.user_id).toBe(owner.userId);
    expect(funnel[0]?.workspace_id).toBe(owner.workspaceId);
  });

  it('writes one funnel event per card, so BM §9 can count them', async () => {
    await create({ title: 'One' });
    await create({ title: 'Two' });

    expect(await storedFunnelEvents(handle, 'card.created')).toHaveLength(2);
  });
});

describe('validation (AC 1)', () => {
  it('trims the title', async () => {
    const card = (await create({ title: '  Write launch post  ' })).json<{ title: string }>();

    expect(card.title).toBe('Write launch post');
  });

  it('refuses a blank or whitespace-only title with 422', async () => {
    for (const title of ['', '   ', '\n\t']) {
      expect((await create({ title })).statusCode).toBe(422);
    }
  });

  it(`accepts ${CARD_TITLE_MAX_LENGTH} characters and refuses one more`, async () => {
    expect((await create({ title: 'x'.repeat(CARD_TITLE_MAX_LENGTH) })).statusCode).toBe(201);
    expect((await create({ title: 'x'.repeat(CARD_TITLE_MAX_LENGTH + 1) })).statusCode).toBe(422);
  });

  it('refuses an unknown field rather than ignoring it', async () => {
    expect((await create({ title: 'Card', position: 1 })).statusCode).toBe(422);
  });

  it('writes nothing when validation fails', async () => {
    await create({ title: '' });

    expect(await storedFunnelEvents(handle, 'card.created')).toHaveLength(0);
  });
});

describe('the target list (AC 1)', () => {
  it('returns 404 for an archived list', async () => {
    const archived = await insertList(handle, boardId, {
      name: 'Archived',
      position: 9999,
      archived: true,
    });

    const response = await create({ title: 'Nope' }, archived);

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });

  it('returns 404 for a list id that does not exist', async () => {
    const response = await create({ title: 'Nope' }, '00000000-0000-4000-8000-000000000000');

    expect(response.statusCode).toBe(404);
  });

  it('returns 422 for a list id that is not a uuid', async () => {
    expect((await create({ title: 'Nope' }, 'not-a-uuid')).statusCode).toBe(422);
  });
});

describe('hydration (AC 1, FB-04)', () => {
  it('shows the new card on the board in position order', async () => {
    await create({ title: 'First' });
    await create({ title: 'Second' });

    const board = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });

    const lists = board.json<{ lists: { id: string; cards: { title: string }[] }[] }>().lists;
    const target = lists.find((list) => list.id === listId);

    expect(target?.cards.map((card) => card.title)).toStrictEqual(['First', 'Second']);
  });
});
