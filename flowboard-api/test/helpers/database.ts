import { POSITION_STEP } from '@flowboard/shared';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { newId } from '../../src/db/id.js';
import { migrateUp } from '../../src/db/migrate.js';
import { resetDatabase } from '../../src/db/seed/seed.js';

/**
 * Integration-test fixtures (STANDARDS §4, FB-01 §3).
 *
 * Tests run against the real Docker Postgres named by `DATABASE_URL_TEST`.
 * `resetDatabase()` truncates every application table; `seedMinimal()` builds
 * the smallest graph a route test needs (one user, workspace, board, list and
 * card) without the weight of the full prototype seed.
 */

export { resetDatabase };

/** The test database connection string, or a clear failure saying how to get one. */
export function testConnectionString(): string {
  const connectionString = process.env['DATABASE_URL_TEST'];

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_TEST is required for integration tests. Run `docker compose up -d` and copy .env.example to .env.',
    );
  }

  return connectionString;
}

/** Opens a handle to the test database and makes sure the schema is current. */
export async function openTestDatabase(maxConnections = 2): Promise<DatabaseHandle> {
  const handle = createDatabase(testConnectionString(), maxConnections);
  await migrateUp(handle);

  return handle;
}

export interface MinimalSeed {
  readonly userId: string;
  readonly workspaceId: string;
  readonly boardId: string;
  readonly listId: string;
  readonly cardId: string;
  readonly labelId: string;
}

/**
 * One user, workspace, board (with the user as board admin), label, list and
 * card. Truncates first, so each test file starts from a known state.
 */
export async function seedMinimal(handle: DatabaseHandle): Promise<MinimalSeed> {
  await resetDatabase(handle);

  const userId = newId();
  const workspaceId = newId();
  const boardId = newId();
  const labelId = newId();
  const listId = newId();
  const cardId = newId();

  await handle.sql.begin(async (tx) => {
    await tx`
      insert into "user" (id, email, password_hash, display_name, initials, avatar_color)
      values (${userId}, 'minimal@example.test', 'argon2id$placeholder-not-a-real-hash',
              'Minimal User', 'MU', '#3d6df0')
    `;

    await tx`
      insert into workspace (id, name, created_by)
      values (${workspaceId}, 'Minimal Workspace', ${userId})
    `;

    await tx`
      insert into workspace_member (workspace_id, user_id, role)
      values (${workspaceId}, ${userId}, 'admin')
    `;

    await tx`
      insert into board (id, workspace_id, name, color, created_by)
      values (${boardId}, ${workspaceId}, 'Minimal Board', '#3d6df0', ${userId})
    `;

    await tx`
      insert into board_member (board_id, user_id, role)
      values (${boardId}, ${userId}, 'admin')
    `;

    await tx`
      insert into label (id, board_id, name, color)
      values (${labelId}, ${boardId}, 'Bug', '#c9372c')
    `;

    await tx`
      insert into list (id, board_id, name, position, wip_limit)
      values (${listId}, ${boardId}, 'To Do', ${POSITION_STEP}, null)
    `;

    await tx`
      insert into card (id, list_id, title, position, created_by)
      values (${cardId}, ${listId}, 'Minimal Card', ${POSITION_STEP}, ${userId})
    `;
  });

  return { userId, workspaceId, boardId, listId, cardId, labelId };
}
