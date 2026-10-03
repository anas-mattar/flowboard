import { BOARD_COLORS, DEFAULT_LABELS, DEFAULT_LISTS, POSITION_STEP } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { newId } from '../src/db/id.js';
import { buildTestApp, TEST_WEB_ORIGIN } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { addWorkspaceMember, as, signUp, type TestAccount } from './helpers/boards.js';

/**
 * `POST /v1/boards` (FB-04 §10 integration row 1). Covers AC 1 and the
 * creation rows of AC 8.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;

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
});

async function create(payload: Record<string, unknown>, account: TestAccount = owner) {
  return await app.inject({ method: 'POST', url: '/v1/boards', payload, ...as(account) });
}

describe('POST /v1/boards (AC 1)', () => {
  it('returns 201 with the three default lists at 1024/2048/3072 and WIP 3 on Doing', async () => {
    const response = await create({ name: 'Launch' });

    expect(response.statusCode).toBe(201);

    const json = response.json<{
      board: { id: string; name: string; color: string; workspaceId: string };
      lists: { name: string; position: number; wipLimit: number | null; cards: unknown[] }[];
    }>();

    expect(json.board.name).toBe('Launch');
    expect(json.board.workspaceId).toBe(owner.workspaceId);

    expect(json.lists.map((list) => [list.name, list.position, list.wipLimit])).toEqual([
      ['To Do', POSITION_STEP, null],
      ['Doing', POSITION_STEP * 2, 3],
      ['Done', POSITION_STEP * 3, null],
    ]);

    // FB-04 §3: hydration already returns `cards: []` so the schema is final.
    expect(json.lists.every((list) => list.cards.length === 0)).toBe(true);
  });

  it('matches DEFAULT_LISTS, so the API and the web app cannot disagree (CL-A7)', async () => {
    const json = (await create({ name: 'Launch' })).json<{
      lists: { name: string; wipLimit: number | null }[];
    }>();

    expect(json.lists.map((list) => ({ name: list.name, wipLimit: list.wipLimit }))).toEqual([
      ...DEFAULT_LISTS,
    ]);
  });

  it('seeds the six default labels with the prototype colours (CL-D3)', async () => {
    const json = (await create({ name: 'Launch' })).json<{
      labels: { name: string; color: string }[];
    }>();

    expect(json.labels).toHaveLength(6);
    expect([...json.labels].map((label) => ({ name: label.name, color: label.color }))).toEqual(
      [...DEFAULT_LABELS].sort((left, right) => left.name.localeCompare(right.name)),
    );
  });

  it('returns the creator as the only member, with role admin', async () => {
    const json = (await create({ name: 'Launch' })).json<{
      members: { user: { id: string }; role: string }[];
      callerRole: string;
      starred: boolean;
    }>();

    expect(json.members).toHaveLength(1);
    expect(json.members[0]?.user.id).toBe(owner.userId);
    expect(json.members[0]?.role).toBe('admin');
    expect(json.callerRole).toBe('admin');
    expect(json.starred).toBe(false);
  });

  it('writes the board_member row and the board.created funnel event (CL-E20)', async () => {
    const boardId = (await create({ name: 'Launch' })).json<{ board: { id: string } }>().board.id;

    const members = await handle.sql<{ role: string }[]>`
      select role from board_member where board_id = ${boardId} and user_id = ${owner.userId}
    `;
    expect(members[0]?.role).toBe('admin');

    const events = await handle.sql<{ type: string; user_id: string; workspace_id: string }[]>`
      select type, user_id, workspace_id from funnel_event where type = 'board.created'
    `;
    expect(events).toHaveLength(1);
    expect(events[0]?.user_id).toBe(owner.userId);
    expect(events[0]?.workspace_id).toBe(owner.workspaceId);
  });

  it('takes the next palette colour per board ever created in the workspace (CL-A12)', async () => {
    const colors: string[] = [];

    for (let index = 0; index < BOARD_COLORS.length + 1; index += 1) {
      const response = await create({ name: `Board ${index}` });
      colors.push(response.json<{ board: { color: string } }>().board.color);
    }

    expect(colors).toEqual([...BOARD_COLORS, BOARD_COLORS[0]]);
  });

  it('leaves no rows at all when the transaction fails part way', async () => {
    // The hook is the only way to fail after the board insert without mocking
    // the database, which STANDARDS §4 does not accept as integration cover.
    const { createBoard } = await import('../src/repositories/board.js');

    await expect(
      createBoard(
        handle.db,
        { name: 'Doomed', workspaceId: owner.workspaceId, createdBy: owner.userId },
        {
          onAfterBoardInsert: () => {
            throw new Error('forced rollback');
          },
        },
      ),
    ).rejects.toThrow('forced rollback');

    const boards = await handle.sql<{ count: number }[]>`
      select count(*)::int as count from board where name = 'Doomed'
    `;
    expect(boards[0]?.count).toBe(0);

    const events = await handle.sql<{ count: number }[]>`
      select count(*)::int as count from funnel_event where type = 'board.created'
    `;
    expect(events[0]?.count).toBe(0);
  });
});

describe('POST /v1/boards validation and authorisation (AC 8)', () => {
  it('trims the name and refuses one that is blank after trimming', async () => {
    const trimmed = await create({ name: '  Launch  ' });
    expect(trimmed.json<{ board: { name: string } }>().board.name).toBe('Launch');

    expect((await create({ name: '   ' })).statusCode).toBe(422);
  });

  it('refuses a name longer than 120 characters', async () => {
    expect((await create({ name: 'a'.repeat(121) })).statusCode).toBe(422);
    expect((await create({ name: 'a'.repeat(120) })).statusCode).toBe(201);
  });

  it('refuses an unknown field rather than ignoring it', async () => {
    expect((await create({ name: 'Launch', color: '#3d6df0' })).statusCode).toBe(422);
  });

  it('refuses a workspaceId the caller does not belong to, with 422', async () => {
    const stranger = await signUp(app, 'Grace Hopper');

    const response = await create({ name: 'Launch', workspaceId: stranger.workspaceId });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_failed');
  });

  it('refuses a workspaceId that does not exist, with the same 422', async () => {
    const response = await create({ name: 'Launch', workspaceId: newId() });

    expect(response.statusCode).toBe(422);
  });

  it('allows a plain workspace member to create a board (FS §6 member row)', async () => {
    const member = await signUp(app, 'Omar Haddad');
    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');

    const response = await create({ name: 'Member board', workspaceId: owner.workspaceId }, member);

    expect(response.statusCode).toBe(201);
    expect(response.json<{ callerRole: string }>().callerRole).toBe('admin');
  });

  it('defaults to the caller’s current workspace when none is sent (CL-D7)', async () => {
    const json = (await create({ name: 'Launch' })).json<{ board: { workspaceId: string } }>();

    expect(json.board.workspaceId).toBe(owner.workspaceId);
  });

  it('refuses an unauthenticated request with 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      payload: { name: 'Launch' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a cookie-authenticated create from a foreign Origin (CL-E9)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      payload: { name: 'Launch' },
      headers: { origin: 'https://evil.example' },
      ...as(owner),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('bad_origin');
  });

  it('allows a cookie-authenticated create from the web origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      payload: { name: 'Launch' },
      headers: { origin: TEST_WEB_ORIGIN },
      ...as(owner),
    });

    expect(response.statusCode).toBe(201);
  });
});
