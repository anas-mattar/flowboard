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
  signUp,
  type TestAccount,
} from './helpers/boards.js';

/** FB-05 AC 1 and AC 9: `POST /v1/boards/{id}/lists` (L-01, CL-E33). */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;

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
});

async function createList(name: string, account: TestAccount = owner) {
  return app.inject({
    method: 'POST',
    url: `/v1/boards/${boardId}/lists`,
    payload: { name },
    ...as(account),
  });
}

describe('POST /v1/boards/{id}/lists (AC 1)', () => {
  it('appends the list after the three defaults, at 4096', async () => {
    const response = await createList('Review');

    expect(response.statusCode).toBe(201);

    const list = response.json<{
      name: string;
      position: number;
      wipLimit: number | null;
      archivedAt: string | null;
      boardId: string;
    }>();

    // The default board has lists at 1024, 2048 and 3072 (CL-A7).
    expect(list.position).toBe(4 * POSITION_STEP);
    expect(list.name).toBe('Review');
    expect(list.wipLimit).toBeNull();
    expect(list.archivedAt).toBeNull();
    expect(list.boardId).toBe(boardId);
  });

  it('starts at 1024 on a board with no lists', async () => {
    await handle.sql`delete from list where board_id = ${boardId}`;

    const response = await createList('First');

    expect(response.statusCode).toBe(201);
    expect(response.json<{ position: number }>().position).toBe(POSITION_STEP);
  });

  it('keeps appending, so successive lists stay in creation order', async () => {
    const first = await createList('Fourth');
    const second = await createList('Fifth');

    expect(first.json<{ position: number }>().position).toBe(4 * POSITION_STEP);
    expect(second.json<{ position: number }>().position).toBe(5 * POSITION_STEP);
  });

  it('ignores an archived list when computing the end of the board', async () => {
    // An archived list at a high position must not push new lists past it:
    // it is invisible until FB-17 restores it.
    await handle.sql`
      insert into list (id, board_id, name, position, archived_at)
      values (gen_random_uuid(), ${boardId}, 'Archived', ${99 * POSITION_STEP}, now())
    `;

    const response = await createList('Review');

    expect(response.json<{ position: number }>().position).toBe(4 * POSITION_STEP);
  });

  it('is visible to another board member in the next hydration', async () => {
    const member = await signUp(app, 'Omar Haddad');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');

    const created = await createList('Review');
    const createdId = created.json<{ id: string }>().id;

    const hydration = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      ...as(member),
    });

    const lists = hydration.json<{ lists: { id: string; name: string }[] }>().lists;

    expect(lists.map((list) => list.id)).toContain(createdId);
    // Appended, so it is last in the position-ordered hydration.
    expect(lists[lists.length - 1]?.name).toBe('Review');
  });

  it('trims the name and refuses a blank or over-long one with 422', async () => {
    const trimmed = await createList('  Review  ');
    expect(trimmed.json<{ name: string }>().name).toBe('Review');

    for (const name of ['', '   ', 'x'.repeat(81)]) {
      const response = await createList(name);

      expect(response.statusCode).toBe(422);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_failed');
    }
  });

  it('accepts a name of exactly 80 characters (CL-E33)', async () => {
    const response = await createList('x'.repeat(80));

    expect(response.statusCode).toBe(201);
  });

  it('returns 404 for a board that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/boards/3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f/lists',
      payload: { name: 'Review' },
      ...as(owner),
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('an archived board (AC 9)', () => {
  beforeEach(async () => {
    await app.inject({
      method: 'PATCH',
      url: `/v1/boards/${boardId}`,
      payload: { archived: true },
      ...as(owner),
    });
  });

  it('returns 422 for an admin, who can see it and must restore it first', async () => {
    const response = await createList('Review');

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { message: string } }>().error.message).toMatch(/archived/i);
  });

  it('returns 404 for a board member, who cannot see it at all', async () => {
    const member = await signUp(app, 'Omar Haddad');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addBoardMember(handle, boardId, member.userId, 'member');

    const response = await createList('Review', member);

    expect(response.statusCode).toBe(404);
  });
});
