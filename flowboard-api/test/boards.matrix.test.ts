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

/**
 * The FB-04 §8 authorisation table, transcribed row for row (STANDARDS §1.4,
 * AC 8). The table below is the specification table; the tests are generated
 * from it, so a rule can only change here and in the specification together.
 *
 * Observer and member rows insert `board_member` directly, because invitations
 * arrive in FB-09 (FB-04 §8 note).
 */

/** The six columns of the FB-04 §8 table. */
const PERSONAS = [
  'workspaceAdmin',
  'boardAdmin',
  'boardMember',
  'observer',
  'workspaceMemberOffBoard',
  'otherWorkspace',
] as const;

type Persona = (typeof PERSONAS)[number];

/** The capability rows of FB-04 §8, as the statuses each persona should see. */
interface CapabilityRow {
  readonly capability: string;
  /** Expected HTTP status per persona. */
  readonly expected: Readonly<Record<Persona, number>>;
}

const MATRIX: readonly CapabilityRow[] = [
  {
    // "List boards (sees this board)" — 200 for everyone who is authenticated;
    // the ✓/— of the table is whether the board appears, asserted separately.
    capability: 'List boards (sees this board)',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 200,
      workspaceMemberOffBoard: 200,
      otherWorkspace: 200,
    },
  },
  {
    capability: 'Create board in workspace',
    expected: {
      workspaceAdmin: 201,
      boardAdmin: 201,
      boardMember: 201,
      observer: 201,
      workspaceMemberOffBoard: 201,
      // A workspace the caller has not joined is a 422 (FB-04 §8 last column).
      otherWorkspace: 422,
    },
  },
  {
    capability: 'View board (hydrate)',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 200,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'Rename, recolour, archive',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 403,
      observer: 403,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'Star',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 200,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'View archived board',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 404,
      observer: 404,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
];

/** Which personas see this board in `GET /v1/boards` (the ✓ of row one). */
const SEES_BOARD_IN_LIST: Readonly<Record<Persona, boolean>> = {
  workspaceAdmin: true,
  boardAdmin: true,
  boardMember: true,
  observer: true,
  workspaceMemberOffBoard: false,
  otherWorkspace: false,
};

let handle: DatabaseHandle;
let app: FastifyInstance;
let accounts: Record<Persona, TestAccount>;
let boardId: string;
/** A second, archived board, for the "View archived board" row. */
let archivedBoardId: string;

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

  // The board admin owns the workspace the board lives in.
  const boardAdmin = await signUp(app, 'Ada Lovelace');
  const workspaceAdmin = await signUp(app, 'Lena Fischer');
  const boardMember = await signUp(app, 'Omar Haddad');
  const observer = await signUp(app, 'Priya Nair');
  const workspaceMemberOffBoard = await signUp(app, 'Tom Becker');
  const otherWorkspace = await signUp(app, 'Grace Hopper');

  const workspaceId = boardAdmin.workspaceId;

  await addWorkspaceMember(handle, workspaceId, workspaceAdmin.userId, 'admin');
  await addWorkspaceMember(handle, workspaceId, boardMember.userId, 'member');
  await addWorkspaceMember(handle, workspaceId, observer.userId, 'member');
  await addWorkspaceMember(handle, workspaceId, workspaceMemberOffBoard.userId, 'member');

  accounts = {
    workspaceAdmin: { ...workspaceAdmin, workspaceId },
    boardAdmin,
    boardMember: { ...boardMember, workspaceId },
    observer: { ...observer, workspaceId },
    workspaceMemberOffBoard: { ...workspaceMemberOffBoard, workspaceId },
    otherWorkspace,
  };

  boardId = await createBoardAs(app, boardAdmin, 'Matrix board');
  await addBoardMember(handle, boardId, boardMember.userId, 'member');
  await addBoardMember(handle, boardId, observer.userId, 'observer');

  archivedBoardId = await createBoardAs(app, boardAdmin, 'Archived board');
  await addBoardMember(handle, archivedBoardId, boardMember.userId, 'member');
  await addBoardMember(handle, archivedBoardId, observer.userId, 'observer');
  await app.inject({
    method: 'PATCH',
    url: `/v1/boards/${archivedBoardId}`,
    payload: { archived: true },
    ...as(boardAdmin),
  });
});

/** Performs the request for one capability row as one persona. */
async function perform(capability: string, persona: Persona) {
  const account = accounts[persona];

  switch (capability) {
    case 'List boards (sees this board)':
      return app.inject({ method: 'GET', url: '/v1/boards', ...as(account) });

    case 'Create board in workspace':
      return app.inject({
        method: 'POST',
        url: '/v1/boards',
        // Always naming the board's workspace is what makes the last column a
        // 422 rather than a success in the caller's own workspace.
        payload: { name: 'Created by matrix', workspaceId: accounts.boardAdmin.workspaceId },
        ...as(account),
      });

    case 'View board (hydrate)':
      return app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(account) });

    case 'Rename, recolour, archive':
      return app.inject({
        method: 'PATCH',
        url: `/v1/boards/${boardId}`,
        payload: { name: `Renamed by ${persona}` },
        ...as(account),
      });

    case 'Star':
      return app.inject({
        method: 'PATCH',
        url: `/v1/boards/${boardId}`,
        payload: { starred: true },
        ...as(account),
      });

    case 'View archived board':
      return app.inject({ method: 'GET', url: `/v1/boards/${archivedBoardId}`, ...as(account) });

    default:
      throw new Error(`No request defined for capability ${capability}`);
  }
}

describe('FB-04 §8 authorisation matrix', () => {
  it.each(
    MATRIX.flatMap((row) =>
      PERSONAS.map((persona) => [row.capability, persona, row.expected[persona]] as const),
    ),
  )('%s as %s → %i', async (capability, persona, expected) => {
    const response = await perform(capability, persona);

    expect(response.statusCode).toBe(expected);
  });

  it.each(PERSONAS.map((persona) => [persona, SEES_BOARD_IN_LIST[persona]] as const))(
    'GET /v1/boards as %s includes the board: %s',
    async (persona, visible) => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/boards',
        ...as(accounts[persona]),
      });

      const ids = response.json<{ items: { id: string }[] }>().items.map((item) => item.id);

      expect(ids.includes(boardId)).toBe(visible);
    },
  );

  it('refuses every board route to an unauthenticated caller with 401', async () => {
    const requests = [
      app.inject({ method: 'GET', url: '/v1/boards' }),
      app.inject({ method: 'POST', url: '/v1/boards', payload: { name: 'Nope' } }),
      app.inject({ method: 'GET', url: `/v1/boards/${boardId}` }),
      app.inject({ method: 'PATCH', url: `/v1/boards/${boardId}`, payload: { name: 'Nope' } }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.statusCode).toBe(401);
    }
  });
});

describe('matrix completeness (STANDARDS §1.4)', () => {
  it('covers every capability row and every persona column of FB-04 §8', () => {
    expect(MATRIX).toHaveLength(6);

    for (const row of MATRIX) {
      expect(Object.keys(row.expected).sort()).toEqual([...PERSONAS].sort());
    }
  });
});
