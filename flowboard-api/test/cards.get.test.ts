import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { newId } from '../src/db/id.js';
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
} from './helpers/cards.js';

/** FB-06 AC 2: `GET /v1/cards/{id}` (C-03, CL-E26, CL-E38). */

let handle: DatabaseHandle;
let app: FastifyInstance;
let boardAdmin: TestAccount;
let workspaceAdmin: TestAccount;
let member: TestAccount;
let observer: TestAccount;
let offBoard: TestAccount;
let otherWorkspace: TestAccount;
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

  boardAdmin = await signUp(app, 'Ada Lovelace');
  workspaceAdmin = await signUp(app, 'Lena Fischer');
  member = await signUp(app, 'Omar Haddad');
  observer = await signUp(app, 'Priya Nair');
  offBoard = await signUp(app, 'Tom Becker');
  otherWorkspace = await signUp(app, 'Grace Hopper');

  const workspaceId = boardAdmin.workspaceId;

  await addWorkspaceMember(handle, workspaceId, workspaceAdmin.userId, 'admin');
  await addWorkspaceMember(handle, workspaceId, member.userId, 'member');
  await addWorkspaceMember(handle, workspaceId, observer.userId, 'member');
  await addWorkspaceMember(handle, workspaceId, offBoard.userId, 'member');

  boardId = await createBoardAs(app, boardAdmin, 'Detail board');
  await addBoardMember(handle, boardId, member.userId, 'member');
  await addBoardMember(handle, boardId, observer.userId, 'observer');

  listId = await createListAs(app, boardAdmin, boardId, 'To Do');
  cardId = (await createCardAs(app, boardAdmin, listId, 'Write launch post')).id;

  const board = await app.inject({
    method: 'GET',
    url: `/v1/boards/${boardId}`,
    ...as(boardAdmin),
  });
  labelId = board.json<{ labels: { id: string }[] }>().labels[0]?.id ?? '';
});

function get(account: TestAccount, target = cardId) {
  return app.inject({ method: 'GET', url: `/v1/cards/${target}`, ...as(account) });
}

describe('the CardDetail shape (AC 2, CL-E38)', () => {
  it('returns every field the modal needs', async () => {
    const response = await get(boardAdmin);

    expect(response.statusCode).toBe(200);

    const detail = response.json<Record<string, unknown>>();

    expect(Object.keys(detail).sort()).toStrictEqual(
      [
        'archivedAt',
        'boardId',
        'checklistItems',
        'commentCount',
        'createdAt',
        'createdBy',
        'description',
        'dueAt',
        'dueComplete',
        'id',
        'labelIds',
        'listId',
        'listName',
        'memberIds',
        'position',
        'title',
        'updatedAt',
      ].sort(),
    );

    expect(detail['boardId']).toBe(boardId);
    expect(detail['listName']).toBe('To Do');
    expect(detail['description']).toBeNull();
    expect(detail['createdBy']).toBe(boardAdmin.userId);
    expect(detail['archivedAt']).toBeNull();
    expect(detail['commentCount']).toBe(0);
  });

  it('returns the description exactly as stored, unrendered (CL-D17)', async () => {
    const markdown = '# Heading\n\n<script>alert(1)</script>\n\n- one\n- two';

    await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { description: markdown },
      ...as(boardAdmin),
    });

    expect((await get(boardAdmin)).json<{ description: string }>().description).toBe(markdown);
  });

  it('joins labels, members, checklist items in position order and the comment count', async () => {
    await attachLabel(handle, cardId, labelId);
    await attachMember(handle, cardId, member.userId);
    await addChecklistItem(handle, cardId, {
      id: newId(),
      text: 'Second',
      done: false,
      position: 2048,
    });
    await addChecklistItem(handle, cardId, {
      id: newId(),
      text: 'First',
      done: true,
      position: 1024,
    });
    await addComment(handle, cardId, { id: newId(), authorId: member.userId, body: 'Looks good' });

    const detail = (await get(boardAdmin)).json<{
      labelIds: string[];
      memberIds: string[];
      checklistItems: { text: string; done: boolean }[];
      commentCount: number;
    }>();

    expect(detail.labelIds).toStrictEqual([labelId]);
    expect(detail.memberIds).toStrictEqual([member.userId]);
    expect(detail.checklistItems.map((item) => item.text)).toStrictEqual(['First', 'Second']);
    expect(detail.checklistItems[0]?.done).toBe(true);
    expect(detail.commentCount).toBe(1);
  });
});

describe('who may read a card (AC 2, AC 9, §8)', () => {
  it('lets every board role read it, Observer included', async () => {
    for (const account of [boardAdmin, workspaceAdmin, member, observer]) {
      expect((await get(account)).statusCode).toBe(200);
    }
  });

  it('returns 404 to a workspace member who is not on the board', async () => {
    expect((await get(offBoard)).statusCode).toBe(404);
  });

  it('returns 404 to a user from another workspace', async () => {
    expect((await get(otherWorkspace)).statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}` });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for a card id that does not exist', async () => {
    expect((await get(boardAdmin, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('returns 422 for a card id that is not a uuid', async () => {
    expect((await get(boardAdmin, 'not-a-uuid')).statusCode).toBe(422);
  });
});

describe('archived cards (AC 2, same rule as CL-E16)', () => {
  beforeEach(async () => {
    await app.inject({ method: 'DELETE', url: `/v1/cards/${cardId}`, ...as(boardAdmin) });
  });

  it('is 404 for a board member and an observer', async () => {
    expect((await get(member)).statusCode).toBe(404);
    expect((await get(observer)).statusCode).toBe(404);
  });

  it('is 200 with archivedAt set for a board admin and a workspace admin', async () => {
    for (const account of [boardAdmin, workspaceAdmin]) {
      const response = await get(account);

      expect(response.statusCode).toBe(200);
      expect(response.json<{ archivedAt: string | null }>().archivedAt).not.toBeNull();
    }
  });
});

describe('an archived board (CL-E16)', () => {
  beforeEach(async () => {
    await app.inject({
      method: 'PATCH',
      url: `/v1/boards/${boardId}`,
      payload: { archived: true },
      ...as(boardAdmin),
    });
  });

  it('hides its cards from a member but not from an admin', async () => {
    expect((await get(member)).statusCode).toBe(404);
    expect((await get(boardAdmin)).statusCode).toBe(200);
  });
});
