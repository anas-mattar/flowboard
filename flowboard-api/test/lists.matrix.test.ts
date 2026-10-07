import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { TEST_WEB_ORIGIN, buildTestApp } from './helpers/app.js';
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
 * The FB-05 §8 authorisation table, transcribed row for row (STANDARDS §1.4,
 * AC 8, CL-E29). The table below is the specification table; the tests are
 * generated from it, so a rule can only change here and in the specification
 * together. The FB-09 generator later replaces this file.
 *
 * Observer and member rows insert `board_member` directly, because invitations
 * arrive in FB-09 (FB-05 §8 note).
 */

/** The six columns of the FB-05 §8 table. */
const PERSONAS = [
  'workspaceAdmin',
  'boardAdmin',
  'boardMember',
  'observer',
  'workspaceMemberOffBoard',
  'otherWorkspace',
] as const;

type Persona = (typeof PERSONAS)[number];

interface CapabilityRow {
  readonly capability: string;
  /** Expected HTTP status per persona. */
  readonly expected: Readonly<Record<Persona, number>>;
}

const MATRIX: readonly CapabilityRow[] = [
  {
    capability: 'Create list',
    expected: {
      workspaceAdmin: 201,
      boardAdmin: 201,
      boardMember: 201,
      observer: 403,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'Rename, reposition, set WIP',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 403,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'Archive all cards',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 403,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'Sort by due date',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 403,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    // Last, because it archives the list the other rows act on; each row gets a
    // fresh fixture from `beforeEach` anyway.
    capability: 'Delete list',
    expected: {
      workspaceAdmin: 204,
      boardAdmin: 204,
      boardMember: 204,
      observer: 403,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
  {
    capability: 'See lists (hydration, FB-04)',
    expected: {
      workspaceAdmin: 200,
      boardAdmin: 200,
      boardMember: 200,
      observer: 200,
      workspaceMemberOffBoard: 404,
      otherWorkspace: 404,
    },
  },
];

let handle: DatabaseHandle;
let app: FastifyInstance;
let accounts: Record<Persona, TestAccount>;
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

  const created = await app.inject({
    method: 'POST',
    url: `/v1/boards/${boardId}/lists`,
    payload: { name: 'Matrix list' },
    ...as(boardAdmin),
  });

  listId = created.json<{ id: string }>().id;
});

/** Performs the request for one capability row as one persona. */
async function perform(capability: string, persona: Persona) {
  const account = accounts[persona];

  switch (capability) {
    case 'Create list':
      return app.inject({
        method: 'POST',
        url: `/v1/boards/${boardId}/lists`,
        payload: { name: `Added by ${persona}` },
        ...as(account),
      });

    case 'Rename, reposition, set WIP':
      return app.inject({
        method: 'PATCH',
        url: `/v1/lists/${listId}`,
        payload: { name: `Renamed by ${persona}` },
        ...as(account),
      });

    case 'Archive all cards':
      return app.inject({
        method: 'POST',
        url: `/v1/lists/${listId}/archive-cards`,
        ...as(account),
      });

    case 'Sort by due date':
      return app.inject({
        method: 'POST',
        url: `/v1/lists/${listId}/sort-by-due`,
        ...as(account),
      });

    case 'Delete list':
      return app.inject({ method: 'DELETE', url: `/v1/lists/${listId}`, ...as(account) });

    case 'See lists (hydration, FB-04)':
      return app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(account) });

    default:
      throw new Error(`No request defined for capability ${capability}`);
  }
}

describe('FB-05 §8 authorisation matrix (AC 8, CL-E29)', () => {
  it.each(
    MATRIX.flatMap((row) =>
      PERSONAS.map((persona) => [row.capability, persona, row.expected[persona]] as const),
    ),
  )('%s as %s → %i', async (capability, persona, expected) => {
    const response = await perform(capability, persona);

    expect(response.statusCode).toBe(expected);
  });

  it('tells an observer apart from an off-board caller by the error code', async () => {
    const observer = await perform('Rename, reposition, set WIP', 'observer');
    const offBoard = await perform('Rename, reposition, set WIP', 'workspaceMemberOffBoard');

    // FB-04 §8: "you may not" is a 403, "there is no such thing" is a 404, and
    // the off-board caller must never learn the list id exists.
    expect(observer.json<{ error: { code: string } }>().error.code).toBe('forbidden');
    expect(offBoard.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });
});

describe('unauthenticated and cross-origin (AC 8)', () => {
  it('refuses every list route with 401 when unauthenticated', async () => {
    const requests = [
      app.inject({ method: 'POST', url: `/v1/boards/${boardId}/lists`, payload: { name: 'No' } }),
      app.inject({ method: 'PATCH', url: `/v1/lists/${listId}`, payload: { name: 'No' } }),
      app.inject({ method: 'DELETE', url: `/v1/lists/${listId}` }),
      app.inject({ method: 'POST', url: `/v1/lists/${listId}/archive-cards` }),
      app.inject({ method: 'POST', url: `/v1/lists/${listId}/sort-by-due` }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.statusCode).toBe(401);
    }
  });

  it('refuses a cookie-authenticated mutation from a foreign Origin with 403 bad_origin (CL-E9)', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/lists/${listId}`,
      payload: { name: 'Cross-site' },
      headers: { origin: 'https://evil.example' },
      ...as(accounts.boardAdmin),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('bad_origin');
  });

  it('accepts a mutation carrying the app’s own Origin', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/lists/${listId}`,
      payload: { name: 'Same site' },
      headers: { origin: TEST_WEB_ORIGIN },
      ...as(accounts.boardAdmin),
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('matrix completeness (STANDARDS §1.4)', () => {
  it('covers every capability row and every persona column of FB-05 §8', () => {
    expect(MATRIX).toHaveLength(6);

    for (const row of MATRIX) {
      expect(Object.keys(row.expected).sort()).toStrictEqual([...PERSONAS].sort());
    }
  });
});
