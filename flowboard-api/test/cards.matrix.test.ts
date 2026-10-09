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
import { createCardAs, createListAs } from './helpers/cards.js';

/**
 * The FB-06 §8 authorisation table, transcribed row for row (STANDARDS §1.4,
 * AC 9, CL-E29). The table below is the specification table; the tests are
 * generated from it, so a rule can only change here and in the specification
 * together. The FB-09 generator later replaces this file.
 *
 * Observer and member rows insert `board_member` directly, because invitations
 * arrive in FB-09 (FB-06 §8 note).
 */

/** The six columns of the FB-06 §8 table. */
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
    capability: 'Create card',
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
    capability: 'Read card detail',
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
    capability: 'Read activity',
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
    capability: 'Edit title, description',
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
    capability: 'Move (menu or drag)',
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
    capability: 'Copy',
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
    // Last, because it archives the card the other rows act on; each row gets a
    // fresh fixture from `beforeEach` anyway.
    capability: 'Delete (archive)',
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
    capability: 'Read archived card',
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

let handle: DatabaseHandle;
let app: FastifyInstance;
let accounts: Record<Persona, TestAccount>;
let boardId: string;
let listId: string;
let cardId: string;
let archivedCardId: string;

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

  listId = await createListAs(app, boardAdmin, boardId, 'Matrix list');
  cardId = (await createCardAs(app, boardAdmin, listId, 'Matrix card')).id;

  archivedCardId = (await createCardAs(app, boardAdmin, listId, 'Archived card')).id;
  await app.inject({
    method: 'DELETE',
    url: `/v1/cards/${archivedCardId}`,
    ...as(boardAdmin),
  });
});

/** Performs the request for one capability row as one persona. */
async function perform(capability: string, persona: Persona) {
  const account = accounts[persona];

  switch (capability) {
    case 'Create card':
      return app.inject({
        method: 'POST',
        url: `/v1/lists/${listId}/cards`,
        payload: { title: `Added by ${persona}` },
        ...as(account),
      });

    case 'Read card detail':
      return app.inject({ method: 'GET', url: `/v1/cards/${cardId}`, ...as(account) });

    case 'Read activity':
      return app.inject({ method: 'GET', url: `/v1/cards/${cardId}/activity`, ...as(account) });

    case 'Edit title, description':
      return app.inject({
        method: 'PATCH',
        url: `/v1/cards/${cardId}`,
        payload: { title: `Renamed by ${persona}`, description: `Written by ${persona}` },
        ...as(account),
      });

    case 'Move (menu or drag)':
      return app.inject({
        method: 'PATCH',
        url: `/v1/cards/${cardId}`,
        payload: { position: 512, via: 'menu' },
        ...as(account),
      });

    case 'Copy':
      return app.inject({ method: 'POST', url: `/v1/cards/${cardId}/copy`, ...as(account) });

    case 'Delete (archive)':
      return app.inject({ method: 'DELETE', url: `/v1/cards/${cardId}`, ...as(account) });

    case 'Read archived card':
      return app.inject({ method: 'GET', url: `/v1/cards/${archivedCardId}`, ...as(account) });

    default:
      throw new Error(`No request defined for capability ${capability}`);
  }
}

describe('FB-06 §8 authorisation matrix (AC 9, CL-E29)', () => {
  it.each(
    MATRIX.flatMap((row) =>
      PERSONAS.map((persona) => [row.capability, persona, row.expected[persona]] as const),
    ),
  )('%s as %s → %i', async (capability, persona, expected) => {
    const response = await perform(capability, persona);

    expect(response.statusCode).toBe(expected);
  });

  it('tells an observer apart from an off-board caller by the error code', async () => {
    const observer = await perform('Edit title, description', 'observer');
    const offBoard = await perform('Edit title, description', 'workspaceMemberOffBoard');

    // FB-04 §8: "you may not" is a 403, "there is no such thing" is a 404, and
    // the off-board caller must never learn the card id exists.
    expect(observer.json<{ error: { code: string } }>().error.code).toBe('forbidden');
    expect(offBoard.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });

  it('refuses the observer before it writes anything (AC 9)', async () => {
    await perform('Edit title, description', 'observer');
    await perform('Move (menu or drag)', 'observer');
    await perform('Copy', 'observer');
    await perform('Delete (archive)', 'observer');

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/cards/${cardId}`,
      ...as(accounts.boardAdmin),
    });

    const card = detail.json<{ title: string; description: string | null; archivedAt: null }>();

    expect(card.title).toBe('Matrix card');
    expect(card.description).toBeNull();
    expect(card.archivedAt).toBeNull();
  });
});

describe('unauthenticated and cross-origin (AC 9)', () => {
  it('refuses every card route with 401 when unauthenticated', async () => {
    const requests = [
      app.inject({ method: 'POST', url: `/v1/lists/${listId}/cards`, payload: { title: 'No' } }),
      app.inject({ method: 'GET', url: `/v1/cards/${cardId}` }),
      app.inject({ method: 'GET', url: `/v1/cards/${cardId}/activity` }),
      app.inject({ method: 'PATCH', url: `/v1/cards/${cardId}`, payload: { title: 'No' } }),
      app.inject({ method: 'POST', url: `/v1/cards/${cardId}/copy` }),
      app.inject({ method: 'DELETE', url: `/v1/cards/${cardId}` }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.statusCode).toBe(401);
    }
  });

  it('refuses a cookie-authenticated mutation from a foreign Origin with 403 bad_origin (CL-E9)', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { title: 'Cross-site' },
      headers: { origin: 'https://evil.example' },
      ...as(accounts.boardAdmin),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('bad_origin');
  });

  it('accepts a mutation carrying the app’s own Origin', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { title: 'Same site' },
      headers: { origin: TEST_WEB_ORIGIN },
      ...as(accounts.boardAdmin),
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('matrix completeness (STANDARDS §1.4)', () => {
  it('covers every capability row and every persona column of FB-06 §8', () => {
    expect(MATRIX).toHaveLength(8);

    for (const row of MATRIX) {
      expect(Object.keys(row.expected).sort()).toStrictEqual([...PERSONAS].sort());
    }
  });
});
