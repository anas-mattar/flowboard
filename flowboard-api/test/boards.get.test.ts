import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { newId } from '../src/db/id.js';
import { SEED_BOARDS, SEED_LABELS } from '../src/db/seed/prototype.js';
import { seedPrototype } from '../src/db/seed/seed.js';
import { buildTestApp, sessionCookieValue } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import {
  addBoardMember,
  addWorkspaceMember,
  as,
  createBoardAs,
  insertCard,
  insertList,
  signUp,
  type TestAccount,
} from './helpers/boards.js';

/**
 * `GET /v1/boards/{id}` (FB-04 §10 integration row 3): the single hydration
 * call against the FB-01 seed, and archived-board visibility. Covers AC 4 and
 * the read rows of AC 8.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;

interface Hydrated {
  board: { id: string; name: string; archivedAt: string | null };
  members: { user: { id: string; displayName: string; initials: string }; role: string }[];
  labels: { id: string; name: string; color: string }[];
  lists: {
    id: string;
    name: string;
    position: number;
    wipLimit: number | null;
    cards: {
      id: string;
      listId: string;
      title: string;
      position: number;
      dueAt: string | null;
      dueComplete: boolean;
      labelIds: string[];
      memberIds: string[];
      checklist: { done: number; total: number };
      commentCount: number;
      hasDescription: boolean;
    }[];
  }[];
  starred: boolean;
  callerRole: string;
}

beforeAll(async () => {
  handle = await openTestDatabase();
  ({ app } = await buildTestApp(handle));
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

async function get(boardId: string, account: TestAccount) {
  return await app.inject({ method: 'GET', url: `/v1/boards/${boardId}`, ...as(account) });
}

describe('GET /v1/boards/{id} against the FB-01 seed (AC 4)', () => {
  let seed: Awaited<ReturnType<typeof seedPrototype>>;
  let ownerCookie: string;
  let owner: TestAccount;

  beforeAll(async () => {
    seed = await seedPrototype(handle);

    // The seed stores a documented local password; log in through the real
    // route so the session is one the API issued.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'anas@example.test', password: 'flowboard-dev' },
    });

    expect(login.statusCode).toBe(200);
    ownerCookie = sessionCookieValue(login.headers) ?? '';
    owner = { userId: seed.ownerId, workspaceId: seed.workspaceId, cookie: ownerCookie };
  });

  it('returns the Product Roadmap Q3 board with the prototype counts in one call', async () => {
    const boardId = seed.boardIdsByKey.get('b1');
    expect(boardId).toBeDefined();

    const response = await get(boardId ?? '', owner);
    expect(response.statusCode).toBe(200);

    const json = response.json<Hydrated>();
    const expected = SEED_BOARDS.find((board) => board.key === 'b1');
    expect(expected).toBeDefined();

    expect(json.board.name).toBe('Product Roadmap Q3');
    expect(json.members).toHaveLength(expected?.memberKeys.length ?? 0);
    expect(json.labels).toHaveLength(SEED_LABELS.length);

    expect(json.lists.map((list) => list.name)).toEqual(expected?.lists.map((list) => list.name));
    expect(json.lists.map((list) => list.cards.length)).toEqual(
      expected?.lists.map((list) => list.cards.length),
    );
    expect(json.lists.map((list) => list.wipLimit)).toEqual(
      expected?.lists.map((list) => list.wipLimit),
    );
  });

  it('returns lists in position order and cards in position order within each list', async () => {
    const json = (await get(seed.boardIdsByKey.get('b1') ?? '', owner)).json<Hydrated>();

    const positions = json.lists.map((list) => list.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    for (const list of json.lists) {
      const cardPositions = list.cards.map((card) => card.position);
      expect([...cardPositions].sort((a, b) => a - b)).toEqual(cardPositions);
      expect(list.cards.every((card) => card.listId === list.id)).toBe(true);
    }
  });

  it('carries the per-card label ids, member ids, checklist, comments and description flag', async () => {
    const json = (await get(seed.boardIdsByKey.get('b1') ?? '', owner)).json<Hydrated>();

    const cards = json.lists.flatMap((list) => list.cards);
    const labelIds = new Set(json.labels.map((label) => label.id));

    // "Drag & drop performance on large boards": 2 labels, 1 member,
    // 2 checklist items with 1 done, 1 comment, a description.
    const dragDrop = cards.find((card) => card.title.startsWith('Drag & drop'));
    expect(dragDrop).toBeDefined();
    expect(dragDrop?.labelIds).toHaveLength(2);
    expect(dragDrop?.memberIds).toHaveLength(1);
    expect(dragDrop?.checklist).toEqual({ done: 1, total: 2 });
    expect(dragDrop?.commentCount).toBe(1);
    expect(dragDrop?.hasDescription).toBe(true);
    expect(dragDrop?.labelIds.every((id) => labelIds.has(id))).toBe(true);

    // "Card detail redesign": 3 checklist items with 2 done, no comments.
    const redesign = cards.find((card) => card.title === 'Card detail redesign');
    expect(redesign?.checklist).toEqual({ done: 2, total: 3 });
    expect(redesign?.commentCount).toBe(0);

    // A card with nothing attached reports empty rather than null.
    const plain = cards.find((card) => card.title === 'Empty-state illustrations');
    expect(plain?.checklist).toEqual({ done: 0, total: 0 });
    expect(plain?.commentCount).toBe(0);
    expect(plain?.hasDescription).toBe(false);
  });

  it('reports due dates and completion as the prototype sets them', async () => {
    const json = (await get(seed.boardIdsByKey.get('b1') ?? '', owner)).json<Hydrated>();
    const cards = json.lists.flatMap((list) => list.cards);

    const done = cards.find((card) => card.title === 'Workspace switcher');
    expect(done?.dueComplete).toBe(true);
    expect(done?.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const undated = cards.find((card) => card.title === 'Empty-state illustrations');
    expect(undated?.dueAt).toBeNull();
    expect(undated?.dueComplete).toBe(false);
  });

  it('reports the caller’s own star and board role', async () => {
    const json = (await get(seed.boardIdsByKey.get('b1') ?? '', owner)).json<Hydrated>();

    // The seed stars b1 for u1 only.
    expect(json.starred).toBe(true);
    expect(json.callerRole).toBe('admin');

    const unstarred = (await get(seed.boardIdsByKey.get('b2') ?? '', owner)).json<Hydrated>();
    expect(unstarred.starred).toBe(false);
  });
});

describe('GET /v1/boards/{id} visibility and archive (AC 7, AC 8, CL-E16)', () => {
  let owner: TestAccount;
  let boardId: string;

  beforeEach(async () => {
    await resetDatabase(handle);
    owner = await signUp(app, 'Ada Lovelace');
    boardId = await createBoardAs(app, owner, 'Launch');
  });

  it('excludes archived lists and archived cards from hydration', async () => {
    const liveList = await insertList(handle, boardId, { name: 'Live', position: 9000 });
    await insertList(handle, boardId, { name: 'Gone', position: 9500, archived: true });

    await insertCard(handle, liveList, { title: 'Kept', position: 1024, createdBy: owner.userId });
    await insertCard(handle, liveList, {
      title: 'Gone card',
      position: 2048,
      createdBy: owner.userId,
      archived: true,
    });

    const json = (await get(boardId, owner)).json<Hydrated>();

    expect(json.lists.map((list) => list.name)).not.toContain('Gone');
    const live = json.lists.find((list) => list.name === 'Live');
    expect(live?.cards.map((card) => card.title)).toEqual(['Kept']);
  });

  it('returns 404 for a board id that does not exist', async () => {
    expect((await get(newId(), owner)).statusCode).toBe(404);
  });

  it('returns 404 to a user from another workspace', async () => {
    const stranger = await signUp(app, 'Grace Hopper');

    expect((await get(boardId, stranger)).statusCode).toBe(404);
  });

  it('returns 404 to a workspace member who is not on the board', async () => {
    const outsider = await signUp(app, 'Tom Becker');
    await addWorkspaceMember(handle, owner.workspaceId, outsider.userId, 'member');

    expect((await get(boardId, outsider)).statusCode).toBe(404);
  });

  it('returns 200 with the right callerRole for each board role', async () => {
    const member = await signUp(app, 'Omar Haddad');
    const observer = await signUp(app, 'Priya Nair');
    const admin = await signUp(app, 'Lena Fischer');

    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addWorkspaceMember(handle, owner.workspaceId, observer.userId, 'member');
    await addWorkspaceMember(handle, owner.workspaceId, admin.userId, 'admin');
    await addBoardMember(handle, boardId, member.userId, 'member');
    await addBoardMember(handle, boardId, observer.userId, 'observer');

    expect((await get(boardId, member)).json<Hydrated>().callerRole).toBe('member');
    expect((await get(boardId, observer)).json<Hydrated>().callerRole).toBe('observer');
    expect((await get(boardId, admin)).json<Hydrated>().callerRole).toBe('workspace_admin');
  });

  it('hides an archived board from members and observers but not from admins', async () => {
    const member = await signUp(app, 'Omar Haddad');
    const observer = await signUp(app, 'Priya Nair');
    const workspaceAdmin = await signUp(app, 'Lena Fischer');

    await addWorkspaceMember(handle, owner.workspaceId, member.userId, 'member');
    await addWorkspaceMember(handle, owner.workspaceId, observer.userId, 'member');
    await addWorkspaceMember(handle, owner.workspaceId, workspaceAdmin.userId, 'admin');
    await addBoardMember(handle, boardId, member.userId, 'member');
    await addBoardMember(handle, boardId, observer.userId, 'observer');

    const archive = await app.inject({
      method: 'PATCH',
      url: `/v1/boards/${boardId}`,
      payload: { archived: true },
      ...as(owner),
    });
    expect(archive.statusCode).toBe(200);

    expect((await get(boardId, member)).statusCode).toBe(404);
    expect((await get(boardId, observer)).statusCode).toBe(404);

    // Board admin and workspace admin keep reading it, so FB-17 can restore.
    const asOwner = await get(boardId, owner);
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.json<Hydrated>().board.archivedAt).not.toBeNull();

    expect((await get(boardId, workspaceAdmin)).statusCode).toBe(200);
  });

  it('refuses an unauthenticated request with 401', async () => {
    const response = await app.inject({ method: 'GET', url: `/v1/boards/${boardId}` });

    expect(response.statusCode).toBe(401);
  });

  it('refuses an id that is not a uuid with 422', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/boards/not-a-uuid',
      ...as(owner),
    });

    expect(response.statusCode).toBe(422);
  });
});
