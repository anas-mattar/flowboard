import type { BoardRole, WorkspaceRole } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import type { DatabaseHandle } from '../../src/db/client.js';
import { newId } from '../../src/db/id.js';
import { sessionCookieValue, signupBody, withSessionCookie } from './app.js';

/**
 * Fixtures the FB-04 board files share.
 *
 * Board members and observers are inserted directly rather than invited,
 * because invitations arrive in FB-09 (FB-04 §8 note). Everything else goes
 * through the real signup route, so the users these tests act as are exactly
 * the users the API would create.
 */

export interface TestAccount {
  readonly userId: string;
  readonly workspaceId: string;
  readonly cookie: string;
}

/** Signs a new user up and returns their session cookie and bootstrap ids. */
export async function signUp(
  app: FastifyInstance,
  displayName = 'Ada Lovelace',
): Promise<TestAccount> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody({ displayName }),
  });

  if (response.statusCode !== 201) {
    throw new Error(`signup fixture failed with ${response.statusCode}: ${response.body}`);
  }

  const json = response.json<{ user: { id: string }; workspace: { id: string } }>();

  return {
    userId: json.user.id,
    workspaceId: json.workspace.id,
    cookie: sessionCookieValue(response.headers) ?? '',
  };
}

/** `inject` options for a request made as `account`. */
export function as(account: TestAccount): ReturnType<typeof withSessionCookie> {
  return withSessionCookie(account.cookie);
}

/** Adds an existing user to a workspace with a role (no invitation flow yet). */
export async function addWorkspaceMember(
  handle: DatabaseHandle,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  await handle.sql`
    insert into workspace_member (workspace_id, user_id, role)
    values (${workspaceId}, ${userId}, ${role})
    on conflict (workspace_id, user_id) do update set role = excluded.role
  `;
}

/** Adds an existing user to a board with a role (FB-09 owns the real flow). */
export async function addBoardMember(
  handle: DatabaseHandle,
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<void> {
  await handle.sql`
    insert into board_member (board_id, user_id, role)
    values (${boardId}, ${userId}, ${role})
    on conflict (board_id, user_id) do update set role = excluded.role
  `;
}

/** Creates a board through the real route and returns its id. */
export async function createBoardAs(
  app: FastifyInstance,
  account: TestAccount,
  name: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/boards',
    payload: { name },
    ...as(account),
  });

  if (response.statusCode !== 201) {
    throw new Error(`createBoard fixture failed with ${response.statusCode}: ${response.body}`);
  }

  return response.json<{ board: { id: string } }>().board.id;
}

/**
 * `archived_at` as a UTC ISO 8601 string. The driver is given text rather
 * than a `Date` so the `timestamptz` parameter type is unambiguous on the
 * wire, exactly as `seed.ts` does for `due_at`.
 */
function archivedAt(archived: boolean | undefined): string | null {
  return archived === true ? new Date().toISOString() : null;
}

/**
 * Inserts a list and a card directly, so a test can set up archived rows the
 * API has no route for yet (lists are FB-05, cards are FB-06).
 */
export async function insertList(
  handle: DatabaseHandle,
  boardId: string,
  options: { name: string; position: number; archived?: boolean },
): Promise<string> {
  const id = newId();

  await handle.sql`
    insert into list (id, board_id, name, position, archived_at)
    values (${id}, ${boardId}, ${options.name}, ${options.position},
            ${archivedAt(options.archived)})
  `;

  return id;
}

export async function insertCard(
  handle: DatabaseHandle,
  listId: string,
  options: { title: string; position: number; createdBy: string; archived?: boolean },
): Promise<string> {
  const id = newId();

  await handle.sql`
    insert into card (id, list_id, title, position, created_by, archived_at)
    values (${id}, ${listId}, ${options.title}, ${options.position}, ${options.createdBy},
            ${archivedAt(options.archived)})
  `;

  return id;
}
