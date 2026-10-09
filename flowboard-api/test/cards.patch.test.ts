import { CARD_DESCRIPTION_MAX_LENGTH, POSITION_STEP } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertList, signUp, type TestAccount } from './helpers/boards.js';
import { createCardAs, createListAs, storedActivity } from './helpers/cards.js';

/** FB-06 AC 3, 4 and 5: `PATCH /v1/cards/{id}` (C-04, C-05, C-11, CL-E23, CL-E35, CL-E41). */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;
let todoId: string;
let doingId: string;
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
  boardId = await createBoardAs(app, owner, 'Patch board');
  todoId = await createListAs(app, owner, boardId, 'To Do');
  doingId = await createListAs(app, owner, boardId, 'Doing');

  const card = await createCardAs(app, owner, todoId, 'Write launch post');
  cardId = card.id;
  cardUpdatedAt = card.updatedAt;
});

async function patch(
  payload: Record<string, unknown>,
  options: { ifMatch?: string; target?: string } = {},
) {
  return app.inject({
    method: 'PATCH',
    url: `/v1/cards/${options.target ?? cardId}`,
    payload,
    ...as(owner),
    ...(options.ifMatch === undefined ? {} : { headers: { 'if-match': options.ifMatch } }),
  });
}

/** The events written by this card, excluding the `card.created` from the fixture. */
async function eventsSinceCreate(target = cardId) {
  const events = await storedActivity(handle, target);

  return events.filter((event) => event.type !== 'card.created');
}

describe('title (AC 3, C-04)', () => {
  it('renames the card, moves updatedAt and writes card.renamed { from, to }', async () => {
    const response = await patch({ title: 'Write the launch post' }, { ifMatch: cardUpdatedAt });

    expect(response.statusCode).toBe(200);

    const card = response.json<{ title: string; updatedAt: string }>();

    expect(card.title).toBe('Write the launch post');
    expect(card.updatedAt).not.toBe(cardUpdatedAt);

    const events = await eventsSinceCreate();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('card.renamed');
    expect(events[0]?.payload).toStrictEqual({
      from: 'Write launch post',
      to: 'Write the launch post',
    });
  });

  it('trims the title and refuses blank or over-long with 422', async () => {
    expect((await patch({ title: '  Trimmed  ' })).json<{ title: string }>().title).toBe('Trimmed');

    for (const title of ['', '   ', 'x'.repeat(501)]) {
      expect((await patch({ title })).statusCode).toBe(422);
    }
  });

  it('writes no event and leaves updatedAt alone when the title is unchanged (AC 3)', async () => {
    const response = await patch({ title: 'Write launch post' });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ updatedAt: string }>().updatedAt).toBe(cardUpdatedAt);
    expect(await eventsSinceCreate()).toHaveLength(0);
  });
});

describe('If-Match (AC 3, FS §7.1, CL-E23)', () => {
  it('succeeds with a matching header', async () => {
    expect((await patch({ title: 'Matched' }, { ifMatch: cardUpdatedAt })).statusCode).toBe(200);
  });

  it('succeeds with no header, because MVP-2 makes it optional', async () => {
    expect((await patch({ title: 'No header' })).statusCode).toBe(200);
  });

  it('returns 409 stale and writes nothing when the header is stale', async () => {
    await patch({ title: 'First writer wins' });

    const response = await patch({ title: 'Second writer' }, { ifMatch: cardUpdatedAt });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('stale');

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect(detail.json<{ title: string }>().title).toBe('First writer wins');
    expect(await eventsSinceCreate()).toHaveLength(1);
  });

  it('checks the header on a move too, because a move is an edit (CL-E23)', async () => {
    await patch({ title: 'Bumped' });

    const response = await patch(
      { listId: doingId, position: 1024, via: 'menu' },
      { ifMatch: cardUpdatedAt },
    );

    expect(response.statusCode).toBe(409);
  });

  it('tolerates ETag quoting around the value', async () => {
    expect((await patch({ title: 'Quoted' }, { ifMatch: `"${cardUpdatedAt}"` })).statusCode).toBe(
      200,
    );
  });
});

describe('description (AC 4, C-05, CL-D17)', () => {
  it('stores the text exactly as sent and writes card.described { hasDescription: true }', async () => {
    const markdown = '# Heading\n\n  indented\n\n- one\n- two\n\n<script>alert(1)</script>';

    const response = await patch({ description: markdown });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ hasDescription: boolean }>().hasDescription).toBe(true);

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect(detail.json<{ description: string }>().description).toBe(markdown);

    const events = await eventsSinceCreate();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('card.described');
    expect(events[0]?.payload).toStrictEqual({ hasDescription: true });
  });

  it('never puts the description text in the activity payload', async () => {
    await patch({ description: 'a secret nobody should find in the audit trail' });

    const events = await eventsSinceCreate();

    expect(JSON.stringify(events[0]?.payload)).not.toContain('secret');
  });

  it('clears the description with null and with an empty string', async () => {
    for (const cleared of [null, '']) {
      await patch({ description: 'Something' });
      const response = await patch({ description: cleared });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ hasDescription: boolean }>().hasDescription).toBe(false);

      const detail = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

      expect(detail.json<{ description: string | null }>().description).toBeNull();
    }
  });

  it('writes card.described { hasDescription: false } when it is cleared', async () => {
    await patch({ description: 'Something' });
    await patch({ description: null });

    const events = await eventsSinceCreate();

    expect(events.map((event) => event.payload)).toStrictEqual([
      { hasDescription: false },
      { hasDescription: true },
    ]);
  });

  it(`accepts ${CARD_DESCRIPTION_MAX_LENGTH} characters and refuses one more`, async () => {
    const atLimit = 'x'.repeat(CARD_DESCRIPTION_MAX_LENGTH);

    expect((await patch({ description: atLimit })).statusCode).toBe(200);
    expect((await patch({ description: `${atLimit}x` })).statusCode).toBe(422);
  });

  it('bounds the length after trailing whitespace, which a textarea adds', async () => {
    const atLimit = 'x'.repeat(CARD_DESCRIPTION_MAX_LENGTH);

    expect((await patch({ description: `${atLimit}\n\n  ` })).statusCode).toBe(200);

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect(detail.json<{ description: string }>().description).toBe(atLimit);
  });

  it('writes no event when the description is unchanged', async () => {
    await patch({ description: 'Same text' });
    const before = (await eventsSinceCreate()).length;

    await patch({ description: 'Same text' });

    expect(await eventsSinceCreate()).toHaveLength(before);
  });

  it('reports hasDescription on the board hydration (AC 4)', async () => {
    async function hydratedCard() {
      const board = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });

      return board
        .json<{ lists: { cards: { id: string; hasDescription: boolean }[] }[] }>()
        .lists.flatMap((list) => list.cards)
        .find((card) => card.id === cardId);
    }

    await patch({ description: 'Now described' });
    expect((await hydratedCard())?.hasDescription).toBe(true);

    await patch({ description: null });
    expect((await hydratedCard())?.hasDescription).toBe(false);
  });
});

describe('move within the same list (AC 5, C-11, CL-E35)', () => {
  it('reorders in place with a position alone and writes card.moved', async () => {
    const response = await patch({ position: 512 });

    expect(response.statusCode).toBe(200);

    const card = response.json<{ position: number; listId: string }>();

    expect(card.position).toBe(512);
    expect(card.listId).toBe(todoId);

    const events = await eventsSinceCreate();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('card.moved');
    expect(events[0]?.payload).toStrictEqual({
      fromListId: todoId,
      toListId: todoId,
      fromPosition: POSITION_STEP,
      toPosition: 512,
      via: 'drag',
    });
  });

  it('stores the position exactly as sent (CL-E41)', async () => {
    const response = await patch({ position: 1536.5 });

    expect(response.json<{ position: number }>().position).toBe(1536.5);
  });

  it('writes no event when the position is unchanged', async () => {
    await patch({ position: POSITION_STEP });

    expect(await eventsSinceCreate()).toHaveLength(0);
  });
});

describe('move across lists (AC 5, C-11, CL-E41)', () => {
  it('moves the card and writes card.moved with via "menu"', async () => {
    const response = await patch({ listId: doingId, position: 1024, via: 'menu' });

    expect(response.statusCode).toBe(200);

    const card = response.json<{ listId: string; position: number }>();

    expect(card.listId).toBe(doingId);
    expect(card.position).toBe(1024);

    const events = await eventsSinceCreate();

    expect(events[0]?.payload).toStrictEqual({
      fromListId: todoId,
      toListId: doingId,
      fromPosition: POSITION_STEP,
      toPosition: 1024,
      via: 'menu',
    });
  });

  it('defaults via to "drag" when it is absent (AC 5)', async () => {
    await patch({ listId: doingId, position: 1024 });

    const events = await eventsSinceCreate();

    expect((events[0]?.payload as { via: string }).via).toBe('drag');
  });

  it('refuses via "sort", which only the FB-05 list route writes', async () => {
    expect((await patch({ position: 512, via: 'sort' })).statusCode).toBe(422);
  });

  it('shows the card in its new list on the next hydration', async () => {
    await patch({ listId: doingId, position: 1024, via: 'menu' });

    const board = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });
    const lists = board.json<{ lists: { id: string; cards: { id: string }[] }[] }>().lists;

    expect(lists.find((list) => list.id === todoId)?.cards).toHaveLength(0);
    expect(lists.find((list) => list.id === doingId)?.cards.map((card) => card.id)).toStrictEqual([
      cardId,
    ]);
  });

  it('refuses listId without position with 422 (AC 5)', async () => {
    expect((await patch({ listId: doingId })).statusCode).toBe(422);
  });

  it('refuses a list on another board with 422 (CL-E41)', async () => {
    const otherBoardId = await createBoardAs(app, owner, 'Another board');
    const foreignListId = await createListAs(app, owner, otherBoardId, 'Elsewhere');

    const response = await patch({ listId: foreignListId, position: 1024, via: 'menu' });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_failed');

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect(detail.json<{ listId: string }>().listId).toBe(todoId);
    expect(await eventsSinceCreate()).toHaveLength(0);
  });

  it('refuses an archived list with 422 (CL-E41)', async () => {
    const archivedId = await insertList(handle, boardId, {
      name: 'Archived',
      position: 9999,
      archived: true,
    });

    const response = await patch({ listId: archivedId, position: 1024, via: 'menu' });

    expect(response.statusCode).toBe(422);
    expect(await eventsSinceCreate()).toHaveLength(0);
  });

  it('refuses a list id that does not exist with 422', async () => {
    const response = await patch({
      listId: '00000000-0000-4000-8000-000000000000',
      position: 1024,
    });

    expect(response.statusCode).toBe(422);
  });

  it('refuses a non-positive or non-finite position with 422', async () => {
    for (const position of [0, -1, 'later']) {
      expect((await patch({ position })).statusCode).toBe(422);
    }
  });
});

describe('several fields at once (AC 3 to 5)', () => {
  it('writes one event per field that actually changed', async () => {
    const response = await patch({
      title: 'Renamed and moved',
      description: 'And described',
      listId: doingId,
      position: 1024,
      via: 'menu',
    });

    expect(response.statusCode).toBe(200);

    const events = await eventsSinceCreate();

    expect(events.map((event) => event.type).sort()).toStrictEqual([
      'card.described',
      'card.moved',
      'card.renamed',
    ]);
  });
});

describe('validation and authorisation (AC 3, AC 9)', () => {
  it('refuses an empty body with 422', async () => {
    expect((await patch({})).statusCode).toBe(422);
  });

  it('refuses via on its own, which is not an edit', async () => {
    expect((await patch({ via: 'menu' })).statusCode).toBe(422);
  });

  it('refuses an unknown field with 422', async () => {
    expect((await patch({ title: 'Card', archived: true })).statusCode).toBe(422);
  });

  it('returns 404 for a card that does not exist, and 401 when unauthenticated', async () => {
    expect(
      (await patch({ title: 'Nope' }, { target: '00000000-0000-4000-8000-000000000000' }))
        .statusCode,
    ).toBe(404);

    const anonymous = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { title: 'Nope' },
    });

    expect(anonymous.statusCode).toBe(401);
  });

  it('returns 404 for an archived card, which FB-17 restores first (AC 7)', async () => {
    await app.inject({ method: 'DELETE', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect((await patch({ title: 'Nope' })).statusCode).toBe(404);
  });
});
