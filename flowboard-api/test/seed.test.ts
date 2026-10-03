import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { SEED_BOARDS, SEED_COUNTS, SEED_USERS } from '../src/db/seed/prototype.js';
import { seedPrototype } from '../src/db/seed/seed.js';
import { openTestDatabase } from './helpers/database.js';

/**
 * FB-01 §4 item 8: `pnpm db:seed` produces exactly the prototype boards
 * (FS §9), and running it twice is idempotent.
 */

let handle: DatabaseHandle;

async function count(table: string): Promise<number> {
  const rows = await handle.sql<{ total: string }[]>`
    select count(*)::text as total from ${handle.sql(table)}
  `;

  return Number(rows[0]?.total ?? '0');
}

async function allCounts(): Promise<Record<string, number>> {
  return {
    user: await count('user'),
    workspace: await count('workspace'),
    board: await count('board'),
    list: await count('list'),
    card: await count('card'),
    label: await count('label'),
    comment: await count('comment'),
    checklist_item: await count('checklist_item'),
    activity_event: await count('activity_event'),
  };
}

beforeAll(async () => {
  handle = await openTestDatabase();
  await seedPrototype(handle);
}, 60_000);

afterAll(async () => {
  await handle.close();
});

describe('the prototype seed (FS §9, FB-01 §4.8)', () => {
  it('creates the PT users and one workspace', async () => {
    expect(await count('user')).toBe(SEED_COUNTS.users);
    expect(await count('workspace')).toBe(SEED_COUNTS.workspaces);

    const rows = await handle.sql<{ name: string }[]>`
      select display_name as name from "user" order by display_name
    `;
    expect(rows.map((row) => row.name)).toStrictEqual(
      [...SEED_USERS].map((user) => user.displayName).sort((a, b) => a.localeCompare(b)),
    );
  });

  it('creates 3 boards and 11 lists', async () => {
    expect(await count('board')).toBe(3);
    expect(SEED_COUNTS.boards).toBe(3);

    expect(await count('list')).toBe(11);
    expect(SEED_COUNTS.lists).toBe(11);
  });

  it('creates the PT cards', async () => {
    expect(await count('card')).toBe(SEED_COUNTS.cards);
    expect(SEED_COUNTS.cards).toBe(18);
  });

  it('creates six labels per board (CL-D3)', async () => {
    expect(await count('label')).toBe(SEED_COUNTS.labels);
    expect(SEED_COUNTS.labels).toBe(18);

    const rows = await handle.sql<{ total: string }[]>`
      select count(*)::text as total from label group by board_id
    `;
    for (const row of rows) {
      expect(Number(row.total)).toBe(6);
    }
  });

  it('records a card.created activity event for every card (FS §5.2)', async () => {
    expect(await count('activity_event')).toBe(SEED_COUNTS.cards);

    const rows = await handle.sql<{ type: string }[]>`
      select distinct type from activity_event
    `;
    expect(rows.map((row) => row.type)).toStrictEqual(['card.created']);
  });

  it('creates the prototype checklists and the one comment', async () => {
    // Card detail redesign (3) and Drag & drop performance (2).
    expect(await count('checklist_item')).toBe(5);
    expect(await count('comment')).toBe(1);
  });

  it('stores an argon2id hash, never the password (FS §8)', async () => {
    const rows = await handle.sql<{ hash: string }[]>`
      select password_hash as hash from "user" limit 1
    `;

    expect(rows[0]?.hash).toMatch(/^\$argon2id\$/);
  });

  it('stars Product Roadmap Q3 for Anas only (CL-E14)', async () => {
    const rows = await handle.sql<{ board: string; name: string }[]>`
      select b.name as board, u.display_name as name
      from board_star s
      join board b on b.id = s.board_id
      join "user" u on u.id = s.user_id
    `;

    expect([...rows]).toStrictEqual([{ board: 'Product Roadmap Q3', name: 'Anas Matar' }]);
  });

  it('gives every board its PT colour and member set', async () => {
    for (const board of SEED_BOARDS) {
      const rows = await handle.sql<{ color: string; members: string }[]>`
        select b.color, count(m.user_id)::text as members
        from board b
        left join board_member m on m.board_id = b.id
        where b.name = ${board.name}
        group by b.color
      `;

      expect(rows[0]?.color, board.name).toBe(board.color);
      expect(Number(rows[0]?.members), board.name).toBe(board.memberKeys.length);
    }
  });

  it('orders list positions ascending within each board (FS §5.1)', async () => {
    const rows = await handle.sql<{ board: string; position: number }[]>`
      select board_id as board, position from list order by board_id, position
    `;

    const byBoard = new Map<string, number[]>();
    for (const row of rows) {
      byBoard.set(row.board, [...(byBoard.get(row.board) ?? []), row.position]);
    }

    for (const positions of byBoard.values()) {
      expect(positions).toStrictEqual([...positions].sort((a, b) => a - b));
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  it('is idempotent: seeding twice leaves the same counts', async () => {
    const before = await allCounts();

    await seedPrototype(handle);

    expect(await allCounts()).toStrictEqual(before);
  }, 60_000);
});
