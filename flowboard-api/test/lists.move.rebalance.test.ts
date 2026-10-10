import { POSITION_STEP, needsRebalance, positionBetween, rebalance } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertList, signUp, type TestAccount } from './helpers/boards.js';
import { createListAs } from './helpers/cards.js';

/**
 * FB-07 AC 8 for lists (FS §5.1, CL-E36): the inline re-balance inside
 * `PATCH /v1/lists/{id}`.
 *
 * The reading of AC 8 is the one documented in `cards.move.rebalance.test.ts`:
 * the mover is dropped into the gap immediately above the same `left`
 * neighbour on every iteration. Lists have no activity log, so the "no event
 * for re-balanced neighbours" half of CL-E36 has nothing to assert here; the
 * `updatedAt` bump does.
 *
 * A new board starts with the three DEFAULT_LISTS (B-02), so the container
 * holds five lists, not three — the re-balance rewrites all of them.
 */

const DROPS = 60;

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let boardId: string;
let leftId: string;
let rightId: string;
let moverId: string;

interface StoredList {
  readonly id: string;
  readonly position: number;
  /** The driver hands `timestamptz` back as a string on this query shape. */
  readonly updated_at: string | Date;
}

function millis(updatedAt: string | Date): number {
  return (updatedAt instanceof Date ? updatedAt : new Date(updatedAt)).getTime();
}

/** The live lists of the board in rank order, read straight from the table. */
async function boardPositions(): Promise<StoredList[]> {
  return handle.sql`
    select id, position, updated_at
    from list
    where board_id = ${boardId} and archived_at is null
    order by position, id
  ` as unknown as Promise<StoredList[]>;
}

function positionOf(lists: readonly StoredList[], id: string): number {
  const found = lists.find((list) => list.id === id);
  if (found === undefined) throw new Error(`list ${id} is not on the board`);

  return found.position;
}

/** A readable position table for the pull-request evidence (FB-07 §11). */
function table(label: string, lists: readonly StoredList[]): string {
  const names = new Map([
    [leftId, 'left'],
    [moverId, 'mover'],
    [rightId, 'right'],
  ]);

  const rows = lists
    .map((list) => `${names.get(list.id) ?? 'default'}=${list.position}`)
    .join('  ');

  return `${label}: ${rows}`;
}

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
  boardId = await createBoardAs(app, owner, 'Re-balance board');

  // Appended after the three default lists, so `left` and `right` are the two
  // highest positions on the board, one POSITION_STEP apart.
  leftId = await createListAs(app, owner, boardId, 'Left neighbour');
  rightId = await createListAs(app, owner, boardId, 'Right neighbour');

  const seeded = await boardPositions();
  const leftPosition = positionOf(seeded, leftId);
  const rightPosition = positionOf(seeded, rightId);

  expect(rightPosition - leftPosition).toBe(POSITION_STEP);

  // The third list starts at the midpoint between them; `POST /v1/boards/{id}/lists`
  // would append it past `right` instead.
  moverId = await insertList(handle, boardId, {
    name: 'Mover',
    position: positionBetween(leftPosition, rightPosition),
  });
});

it('re-balances the board inline across 60 midpoint repositions (AC 8, CL-E36)', async () => {
  const before = await boardPositions();
  const createdAt = new Map(before.map((list) => [list.id, millis(list.updated_at)]));

  let rebalances = 0;
  let neighboursBumped = false;
  const trace: string[] = [table('before          ', before)];

  for (let drop = 0; drop < DROPS; drop += 1) {
    const lists = await boardPositions();
    const sent = positionBetween(positionOf(lists, leftId), positionOf(lists, moverId));

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/lists/${moverId}`,
      payload: { position: sent },
      ...as(owner),
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ position: number }>();
    const after = await boardPositions();

    if (body.position !== sent) {
      rebalances += 1;
      trace.push(table(`re-balance drop ${String(drop + 1).padStart(2, '0')}`, after));

      // Evenly spaced at `rebalance(count)` over the whole board, relative
      // order preserved (the three default lists stay ahead of the mover).
      expect(after.map((list) => list.position)).toStrictEqual(rebalance(after.length));
      expect(after.map((list) => list.id).slice(-3)).toStrictEqual([leftId, moverId, rightId]);
      expect(body.position).toBe(positionOf(after, moverId));

      for (const list of after) {
        const created = createdAt.get(list.id);
        if (created === undefined) continue;

        expect(millis(list.updated_at)).toBeGreaterThan(created);
      }

      neighboursBumped = true;
    }

    expect(needsRebalance(after.map((list) => list.position))).toBe(false);
  }

  const after = await boardPositions();

  trace.push(table(`after ${DROPS} drops `, after));

  // FB-07 §11 asks for the position table before and after in the evidence.
  console.log(trace.join('\n'));

  expect(rebalances).toBeGreaterThan(0);
  expect(neighboursBumped).toBe(true);
  expect(after.map((list) => list.id).slice(-3)).toStrictEqual([leftId, moverId, rightId]);
  expect(needsRebalance(after.map((list) => list.position))).toBe(false);
});

it('leaves a name-only patch out of the re-balance path (CL-E36)', async () => {
  // Drive the board to a gap just above the threshold, then rename: a patch
  // that writes no position must not rewrite the board.
  for (let drop = 0; drop < 20; drop += 1) {
    const lists = await boardPositions();
    const sent = positionBetween(positionOf(lists, leftId), positionOf(lists, moverId));

    await app.inject({
      method: 'PATCH',
      url: `/v1/lists/${moverId}`,
      payload: { position: sent },
      ...as(owner),
    });
  }

  const before = await boardPositions();

  const response = await app.inject({
    method: 'PATCH',
    url: `/v1/lists/${moverId}`,
    payload: { name: 'Renamed' },
    ...as(owner),
  });

  expect(response.statusCode).toBe(200);

  const after = await boardPositions();

  expect(after.map((list) => list.position)).toStrictEqual(before.map((list) => list.position));
});
