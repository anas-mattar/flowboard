import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { appliedMigrations, migrateDown, migrateUp } from '../src/db/migrate.js';
import { testConnectionString } from './helpers/database.js';

/**
 * FB-01 §4 items 1, 2, 5, 6, 7, 9, 10, 11.
 *
 * Runs the migrations up, down and up again against the real test database and
 * asserts the resulting schema: table list, indexes from `pg_indexes`, and the
 * CHECK constraints by inserting invalid rows.
 */

const EXPECTED_TABLES = [
  'activity_event',
  'board',
  'board_member',
  'board_star',
  'card',
  'card_label',
  'card_member',
  'checklist_item',
  'comment',
  'funnel_event',
  'invitation',
  'label',
  'list',
  'session',
  'user',
  'workspace',
  'workspace_member',
] as const;

const EXPECTED_INDEXES = [
  'user_email_lower_idx',
  'workspace_member_user_idx',
  'board_workspace_active_idx',
  'board_member_user_idx',
  'board_star_user_idx',
  'label_board_name_idx',
  'list_board_position_idx',
  'card_list_active_idx',
  'card_label_label_idx',
  'card_member_user_idx',
  'checklist_item_card_position_idx',
  'comment_card_created_idx',
  'activity_event_card_created_idx',
  'invitation_board_idx',
  'session_user_idx',
  'funnel_event_workspace_type_created_idx',
] as const;

let handle: DatabaseHandle;

async function publicTables(): Promise<string[]> {
  const rows = await handle.sql<{ name: string }[]>`
    select table_name as name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;

  return rows.map((row) => row.name);
}

async function publicIndexes(): Promise<string[]> {
  const rows = await handle.sql<{ name: string }[]>`
    select indexname as name from pg_indexes where schemaname = 'public' order by indexname
  `;

  return rows.map((row) => row.name);
}

beforeAll(() => {
  handle = createDatabase(testConnectionString(), 2);
});

afterAll(async () => {
  // Leave the database migrated so other integration files find a schema.
  await migrateUp(handle);
  await handle.close();
});

describe('0000_init up, down, up (FB-01 §4.1, STANDARDS §1.3)', () => {
  it('applies every table', async () => {
    await migrateUp(handle);

    expect(await publicTables()).toStrictEqual([...EXPECTED_TABLES]);
    expect(await appliedMigrations(handle)).toHaveLength(1);
  });

  it('rolls back to an empty public schema', async () => {
    const rolledBack = await migrateDown(handle, { all: true });

    expect(rolledBack).toStrictEqual(['0000_init.sql']);
    expect(await publicTables()).toStrictEqual([]);
    expect(await appliedMigrations(handle)).toStrictEqual([]);
  });

  it('applies again after the rollback', async () => {
    await migrateUp(handle);

    expect(await publicTables()).toStrictEqual([...EXPECTED_TABLES]);
    expect(await appliedMigrations(handle)).toHaveLength(1);
  });

  it('creates all 17 tables (FB-01 §3)', () => {
    expect(EXPECTED_TABLES).toHaveLength(17);
  });
});

describe('indexes (FB-01 §4.11)', () => {
  beforeAll(async () => {
    await migrateUp(handle);
  });

  it('creates every index named in FB-01 §7', async () => {
    const indexes = await publicIndexes();

    for (const expected of EXPECTED_INDEXES) {
      expect(indexes).toContain(expected);
    }
  });

  it('makes the board and card indexes partial on archived_at is null', async () => {
    const rows = await handle.sql<{ name: string; def: string }[]>`
      select indexname as name, indexdef as def
      from pg_indexes
      where schemaname = 'public'
        and indexname in ('board_workspace_active_idx', 'card_list_active_idx')
    `;

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.def).toContain('WHERE (archived_at IS NULL)');
    }
  });

  it('indexes lower(email) uniquely (FB-01 §4.7)', async () => {
    const rows = await handle.sql<{ def: string }[]>`
      select indexdef as def from pg_indexes
      where schemaname = 'public' and indexname = 'user_email_lower_idx'
    `;

    expect(rows[0]?.def).toContain('CREATE UNIQUE INDEX');
    expect(rows[0]?.def).toContain('lower(email)');
  });
});

describe('columns and soft delete (FB-01 §4.2, §4.5, §4.7, §4.10)', () => {
  beforeAll(async () => {
    await migrateUp(handle);
  });

  async function columns(table: string): Promise<string[]> {
    const rows = await handle.sql<{ name: string }[]>`
      select column_name as name from information_schema.columns
      where table_schema = 'public' and table_name = ${table}
      order by column_name
    `;

    return rows.map((row) => row.name);
  }

  it('stores password_hash and never password (FS §8)', async () => {
    const userColumns = await columns('user');

    expect(userColumns).toContain('password_hash');
    expect(userColumns).not.toContain('password');
  });

  it('puts nullable archived_at on board, list and card, and no boolean archived', async () => {
    for (const table of ['board', 'list', 'card']) {
      const tableColumns = await columns(table);
      expect(tableColumns).toContain('archived_at');
      expect(tableColumns).not.toContain('archived');
    }

    const rows = await handle.sql<{ nullable: string }[]>`
      select is_nullable as nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'card' and column_name = 'archived_at'
    `;
    expect(rows[0]?.nullable).toBe('YES');
  });

  it('has no boolean archived column anywhere (FB-01 §4.5)', async () => {
    const rows = await handle.sql<{ table: string }[]>`
      select table_name as "table" from information_schema.columns
      where table_schema = 'public' and column_name = 'archived'
    `;

    // postgres-js returns an array-like Result, not a plain Array.
    expect([...rows]).toStrictEqual([]);
  });

  it('gives every table created_at, and updated_at except the event tables (CL-E19)', async () => {
    const withoutUpdatedAt = [
      'activity_event',
      'funnel_event',
      'board_star',
      'card_label',
      'card_member',
    ];

    for (const table of EXPECTED_TABLES) {
      const tableColumns = await columns(table);
      expect(tableColumns, `${table}.created_at`).toContain('created_at');

      if (withoutUpdatedAt.includes(table)) {
        expect(tableColumns, `${table}.updated_at`).not.toContain('updated_at');
      } else {
        expect(tableColumns, `${table}.updated_at`).toContain('updated_at');
      }
    }
  });

  it('types every id column as uuid (STANDARDS §1.3)', async () => {
    const rows = await handle.sql<{ table: string; type: string }[]>`
      select table_name as "table", data_type as type from information_schema.columns
      where table_schema = 'public' and column_name = 'id'
    `;

    // The five composite-key join tables have no surrogate id.
    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(row.type, row.table).toBe('uuid');
    }
  });

  it('gives card and board a created_by referencing user.id (FB-01 §4.2)', async () => {
    const rows = await handle.sql<{ table: string; target: string }[]>`
      select tc.table_name as "table", ccu.table_name as target
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and tc.table_name in ('card', 'board')
        and kcu.column_name = 'created_by'
    `;

    expect(rows.map((row) => row.table).sort()).toStrictEqual(['board', 'card']);
    for (const row of rows) {
      expect(row.target).toBe('user');
    }
  });
});

describe('CHECK constraints reject invalid rows (FB-01 §4.4, §4.6, §4.9)', () => {
  let userId: string;
  let workspaceId: string;
  let boardId: string;

  beforeAll(async () => {
    await migrateUp(handle);
    const { seedMinimal } = await import('./helpers/database.js');
    const seed = await seedMinimal(handle);
    userId = seed.userId;
    workspaceId = seed.workspaceId;
    boardId = seed.boardId;
  });

  it('rejects a workspace_member role outside admin | member', async () => {
    await expect(
      handle.sql`
        insert into workspace_member (workspace_id, user_id, role)
        values (${workspaceId}, ${userId}, 'observer')
      `,
    ).rejects.toThrow(/workspace_member_role_check/);
  });

  it('rejects a board_member role outside admin | member | observer', async () => {
    await expect(
      handle.sql`
        insert into board_member (board_id, user_id, role)
        values (${boardId}, ${userId}, 'owner')
      `,
    ).rejects.toThrow(/board_member_role_check/);
  });

  it('rejects an activity_event type outside the FS §5.2 list', async () => {
    const rows = await handle.sql<{ id: string }[]>`select id from card limit 1`;
    const cardId = rows[0]?.id;

    await expect(
      handle.sql`
        insert into activity_event (id, card_id, actor_id, type)
        values (gen_random_uuid(), ${cardId!}, ${userId}, 'card.deleted')
      `,
    ).rejects.toThrow(/activity_event_type_check/);
  });

  it('rejects a user theme outside light | dark | system', async () => {
    await expect(
      handle.sql`
        insert into "user" (id, email, password_hash, display_name, initials, avatar_color, theme)
        values (gen_random_uuid(), 'theme@example.test', 'hash', 'Theme', 'TH', '#3d6df0', 'neon')
      `,
    ).rejects.toThrow(/user_theme_check/);
  });

  it('rejects a non-positive wip_limit', async () => {
    await expect(
      handle.sql`
        insert into list (id, board_id, name, position, wip_limit)
        values (gen_random_uuid(), ${boardId}, 'Bad WIP', 2048, 0)
      `,
    ).rejects.toThrow(/list_wip_limit_check/);
  });

  it('rejects a duplicate label name on the same board (FB-01 §4.9)', async () => {
    await expect(
      handle.sql`
        insert into label (id, board_id, name, color)
        values (gen_random_uuid(), ${boardId}, 'Bug', '#c9372c')
      `,
    ).rejects.toThrow(/label_board_name_idx/);
  });

  it('rejects a second user with the same email in a different case (FB-01 §4.7)', async () => {
    await expect(
      handle.sql`
        insert into "user" (id, email, password_hash, display_name, initials, avatar_color)
        values (gen_random_uuid(), 'MINIMAL@EXAMPLE.TEST', 'hash', 'Dup', 'DU', '#3d6df0')
      `,
    ).rejects.toThrow(/user_email_lower_idx/);
  });

  it('rejects a label with a null board_id (CL-D3)', async () => {
    await expect(
      handle.sql`
        insert into label (id, board_id, name, color)
        values (gen_random_uuid(), null, 'Orphan', '#000000')
      `,
    ).rejects.toThrow(/null value in column "board_id"/);
  });
});
