import { CARD_TITLE_MAX_LENGTH } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { newId } from '../src/db/id.js';
import { COPY_SUFFIX } from '../src/cards/copy-title.js';
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
import {
  addChecklistItem,
  addComment,
  attachLabel,
  attachMember,
  createCardAs,
  createListAs,
  storedActivity,
  storedFunnelEvents,
} from './helpers/cards.js';

/** FB-06 AC 6: `POST /v1/cards/{id}/copy` (C-12, CL-A13, CL-E39). */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let member: TestAccount;
let boardId: string;
let listId: string;
let cardId: string;
let labelId: string;

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
  member = await signUp(app, 'Omar Haddad');

  await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');

  boardId = await createBoardAs(app, owner, 'Copy board');
  await addBoardMember(handle, boardId, member.userId, 'member');

  listId = await createListAs(app, owner, boardId, 'To Do');
  cardId = (await createCardAs(app, owner, listId, 'Write launch post')).id;

  const board = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });
  labelId = board.json<{ labels: { id: string }[] }>().labels[0]?.id ?? '';
});

function copy(account: TestAccount = owner, target = cardId) {
  return app.inject({ method: 'POST', url: `/v1/cards/${target}/copy`, ...as(account) });
}

describe('the copy’s title and position (AC 6, C-12)', () => {
  it('returns 201 with "{title} (copy)"', async () => {
    const response = await copy();

    expect(response.statusCode).toBe(201);
    expect(response.json<{ title: string }>().title).toBe('Write launch post (copy)');
  });

  it('fits the title into 500 characters by shortening the original', async () => {
    const longId = (await createCardAs(app, owner, listId, 'x'.repeat(CARD_TITLE_MAX_LENGTH))).id;

    const title = (await copy(owner, longId)).json<{ title: string }>().title;

    expect(title).toHaveLength(CARD_TITLE_MAX_LENGTH);
    expect(title.endsWith(COPY_SUFFIX)).toBe(true);
  });

  it('sits strictly between the original and the next card', async () => {
    const next = await createCardAs(app, owner, listId, 'Second');
    const original = await createCardAs(app, owner, listId, 'Middle');

    // Move the original between the first two, so it has a successor.
    await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${original.id}`,
      payload: { position: 512 },
      ...as(owner),
    });

    const theCopy = (await copy(owner, original.id)).json<{ position: number }>();

    expect(theCopy.position).toBeGreaterThan(512);
    expect(theCopy.position).toBeLessThan(next.position);
  });

  it('is appended when the original is the last card', async () => {
    const original = await createCardAs(app, owner, listId, 'Last');

    const theCopy = (await copy(owner, original.id)).json<{ position: number }>();

    expect(theCopy.position).toBeGreaterThan(original.position);
  });

  it('renders directly below the original in the next hydration', async () => {
    await createCardAs(app, owner, listId, 'Second');
    await copy();

    const board = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(owner) });
    const cards = board
      .json<{ lists: { id: string; cards: { title: string }[] }[] }>()
      .lists.find((list) => list.id === listId)?.cards;

    expect(cards?.map((card) => card.title)).toStrictEqual([
      'Write launch post',
      'Write launch post (copy)',
      'Second',
    ]);
  });
});

describe('the copied fields (AC 6, CL-A13)', () => {
  beforeEach(async () => {
    await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { description: '# Launch\n\n- draft' },
      ...as(owner),
    });

    await handle.sql`
      update card set due_at = '2026-11-01T09:00:00Z', due_complete = true where id = ${cardId}
    `;

    await attachLabel(handle, cardId, labelId);
    await attachMember(handle, cardId, member.userId);
    await addChecklistItem(handle, cardId, {
      id: newId(),
      text: 'Draft',
      done: true,
      position: 1024,
    });
    await addChecklistItem(handle, cardId, {
      id: newId(),
      text: 'Publish',
      done: false,
      position: 2048,
    });
    await addComment(handle, cardId, { id: newId(), authorId: owner.userId, body: 'Not copied' });
  });

  it('copies description, due date and completion, labels, members and checklist items', async () => {
    const copyId = (await copy()).json<{ id: string }>().id;

    const detail = (
      await app.inject({ method: 'GET', url: `/v1/cards/${copyId}`, ...as(owner) })
    ).json<{
      description: string;
      dueAt: string;
      dueComplete: boolean;
      labelIds: string[];
      memberIds: string[];
      checklistItems: { text: string; done: boolean }[];
      commentCount: number;
    }>();

    expect(detail.description).toBe('# Launch\n\n- draft');
    expect(detail.dueAt).toBe('2026-11-01T09:00:00.000Z');
    expect(detail.dueComplete).toBe(true);
    expect(detail.labelIds).toStrictEqual([labelId]);
    expect(detail.memberIds).toStrictEqual([member.userId]);
    expect(detail.checklistItems.map((item) => [item.text, item.done])).toStrictEqual([
      ['Draft', true],
      ['Publish', false],
    ]);
  });

  it('does not copy comments (CL-A13)', async () => {
    const theCopy = (await copy()).json<{ id: string; commentCount: number }>();

    expect(theCopy.commentCount).toBe(0);

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/cards/${theCopy.id}`,
      ...as(owner),
    });

    expect(detail.json<{ commentCount: number }>().commentCount).toBe(0);
  });

  it('gives the copy its own checklist rows rather than sharing the originals', async () => {
    const copyId = (await copy()).json<{ id: string }>().id;

    const rows = (await handle.sql`
      select card_id from checklist_item order by card_id
    `) as unknown as { card_id: string }[];

    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.card_id))).toStrictEqual(new Set([cardId, copyId]));
  });
});

describe('ownership and activity (AC 6, CL-E39)', () => {
  it('makes the caller the copy’s createdBy, not the original’s author', async () => {
    const copyId = (await copy(member)).json<{ id: string }>().id;

    const detail = await app.inject({ method: 'GET', url: `/v1/cards/${copyId}`, ...as(member) });

    expect(detail.json<{ createdBy: string }>().createdBy).toBe(member.userId);

    const original = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect(original.json<{ createdBy: string }>().createdBy).toBe(owner.userId);
  });

  it('writes exactly one card.created { title, copiedFromCardId } on the copy', async () => {
    const copyId = (await copy()).json<{ id: string }>().id;

    const events = await storedActivity(handle, copyId);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('card.created');
    expect(events[0]?.payload).toStrictEqual({
      title: 'Write launch post (copy)',
      copiedFromCardId: cardId,
    });
  });

  it('leaves the original’s activity untouched', async () => {
    const before = await storedActivity(handle, cardId);

    await copy();

    expect(await storedActivity(handle, cardId)).toStrictEqual(before);
  });

  it('writes no funnel event: a copy is not evidence of activation (BM §9)', async () => {
    const before = (await storedFunnelEvents(handle, 'card.created')).length;

    await copy();

    expect(await storedFunnelEvents(handle, 'card.created')).toHaveLength(before);
  });
});

describe('authorisation (AC 6, AC 9)', () => {
  it('returns 404 for a card that does not exist and 401 when unauthenticated', async () => {
    expect((await copy(owner, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);

    const anonymous = await app.inject({ method: 'POST', url: `/v1/cards/${cardId}/copy` });

    expect(anonymous.statusCode).toBe(401);
  });

  it('returns 404 for an archived card', async () => {
    await app.inject({ method: 'DELETE', url: `/v1/cards/${cardId}`, ...as(owner) });

    expect((await copy()).statusCode).toBe(404);
  });
});
