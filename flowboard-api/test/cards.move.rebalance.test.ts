import { POSITION_STEP, needsRebalance, positionBetween, rebalance } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { buildTestApp } from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';
import { as, createBoardAs, insertCard, signUp, type TestAccount } from './helpers/boards.js';
import { createCardAs, createListAs, storedActivity } from './helpers/cards.js';

/**
 * FB-07 AC 8 for cards (FS §5.1, CL-E36): the inline re-balance inside
 * `PATCH /v1/cards/{id}`.
 *
 * **Reading of AC 8.** "60 consecutive `PATCH` moves that each place a third
 * card at the midpoint between the same two neighbours" is taken as: the mover
 * is dropped into the gap immediately above the same `left` neighbour every
 * time, i.e. `positionBetween(left.position, mover.position)`. Sending
 * `positionBetween(left, right)` literally would be a move only on the first
 * iteration — the card already sits at that midpoint afterwards, and CL-E45
 * makes a `PATCH` that changes nothing write no event — so it could not
 * produce the 60 `card.moved` events the same criterion requires. The chosen
 * reading is the one that halves a gap on every drop, which is the precision
 * exhaustion CL-E36 exists for.
 *
 * "After the run the list's positions are evenly spaced (`rebalance(count)`)"
 * is asserted at the moment a re-balance fires rather than after the 60th
 * drop: a drop that does not cross the threshold leaves the mover at a
 * midpoint by definition, so the container is only evenly spaced immediately
 * after a rewrite. The end state is asserted on the properties that do hold
 * throughout — relative order preserved and `needsRebalance` false.
 */

const DROPS = 60;

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let listId: string;
let leftId: string;
let rightId: string;
let moverId: string;

interface StoredCard {
  readonly id: string;
  readonly position: number;
  /** The driver hands `timestamptz` back as a string on this query shape. */
  readonly updated_at: string | Date;
}

function millis(updatedAt: string | Date): number {
  return (updatedAt instanceof Date ? updatedAt : new Date(updatedAt)).getTime();
}

/** The live cards of the list in rank order, read straight from the table. */
async function listPositions(): Promise<StoredCard[]> {
  return handle.sql`
    select id, position, updated_at
    from card
    where list_id = ${listId} and archived_at is null
    order by position, id
  ` as unknown as Promise<StoredCard[]>;
}

function positionOf(cards: readonly StoredCard[], id: string): number {
  const found = cards.find((card) => card.id === id);
  if (found === undefined) throw new Error(`card ${id} is not in the list`);

  return found.position;
}

/** A readable position table for the pull-request evidence (FB-07 §11). */
function table(label: string, cards: readonly StoredCard[]): string {
  const names = new Map([
    [leftId, 'left'],
    [moverId, 'mover'],
    [rightId, 'right'],
  ]);

  const rows = cards.map((card) => `${names.get(card.id) ?? card.id}=${card.position}`).join('  ');

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

  const boardId = await createBoardAs(app, owner, 'Re-balance board');
  listId = await createListAs(app, owner, boardId, 'To Do');

  // AC 8 starts from two cards at 1024 and 2048; `POST /v1/lists/{id}/cards`
  // appends at `positionAtEnd`, so the two creates land exactly there.
  const left = await createCardAs(app, owner, listId, 'Left neighbour');
  const right = await createCardAs(app, owner, listId, 'Right neighbour');

  expect(left.position).toBe(POSITION_STEP);
  expect(right.position).toBe(2 * POSITION_STEP);

  leftId = left.id;
  rightId = right.id;

  // The third card starts at the midpoint between them. It is inserted rather
  // than created through the route so the only events on it are the 60 moves
  // the loop makes (`POST /v1/lists/{id}/cards` appends at the end of the
  // list, which would put it past `right` instead of between the two).
  moverId = await insertCard(handle, listId, {
    title: 'Mover',
    position: positionBetween(left.position, right.position),
    createdBy: owner.userId,
  });
});

it('re-balances the list inline across 60 midpoint drops (AC 8, CL-E36)', async () => {
  const before = await listPositions();

  const createdAt = new Map(before.map((card) => [card.id, millis(card.updated_at)]));

  let rebalances = 0;
  let evenlySpacedSeen = false;
  let neighboursBumped = false;
  const trace: string[] = [table('before          ', before)];

  for (let drop = 0; drop < DROPS; drop += 1) {
    const cards = await listPositions();
    const sent = positionBetween(positionOf(cards, leftId), positionOf(cards, moverId));

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${moverId}`,
      payload: { position: sent },
      ...as(owner),
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ position: number }>();
    const after = await listPositions();

    if (body.position !== sent) {
      // The server re-balanced; the response carries the final position
      // (FB-07 §6) so the client can re-fetch the board (AC 9).
      rebalances += 1;
      trace.push(table(`re-balance drop ${String(drop + 1).padStart(2, '0')}`, after));

      // Evenly spaced at `rebalance(count)`, relative order preserved.
      expect(after.map((card) => card.position)).toStrictEqual(rebalance(after.length));
      expect(after.map((card) => card.id)).toStrictEqual([leftId, moverId, rightId]);
      expect(body.position).toBe(positionOf(after, moverId));
      evenlySpacedSeen = true;

      // Every rewritten row, the untouched neighbours included, has a new
      // `updatedAt` (CL-E36: a stale `If-Match` on a neighbour must re-fetch).
      for (const card of after) {
        const created = createdAt.get(card.id);
        if (created === undefined) continue;

        expect(millis(card.updated_at)).toBeGreaterThan(created);
      }

      neighboursBumped = true;
    }

    // Whatever happened, the settled list never keeps a gap under the
    // threshold — that is the invariant the inline re-balance maintains.
    expect(needsRebalance(after.map((card) => card.position))).toBe(false);
  }

  const after = await listPositions();

  trace.push(table(`after ${DROPS} drops `, after));

  // FB-07 §11 asks for the position table before and after in the evidence.
  console.log(trace.join('\n'));

  // 1024 halves below POSITION_MIN_GAP in about 30 drops, so 60 drops cross
  // the threshold at least once.
  expect(rebalances).toBeGreaterThan(0);
  expect(evenlySpacedSeen).toBe(true);
  expect(neighboursBumped).toBe(true);

  // Relative order survived every rewrite.
  expect(after.map((card) => card.id)).toStrictEqual([leftId, moverId, rightId]);
  expect(needsRebalance(after.map((card) => card.position))).toBe(false);
});

it('writes exactly 60 card.moved events and none for the re-balanced neighbours (AC 8)', async () => {
  for (let drop = 0; drop < DROPS; drop += 1) {
    const cards = await listPositions();
    const sent = positionBetween(positionOf(cards, leftId), positionOf(cards, moverId));

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${moverId}`,
      payload: { position: sent },
      ...as(owner),
    });

    expect(response.statusCode).toBe(200);
  }

  const moverEvents = await storedActivity(handle, moverId);

  expect(moverEvents.filter((event) => event.type === 'card.moved')).toHaveLength(DROPS);

  // The re-balance rewrote the neighbours' positions but not their rank, so
  // neither of them has a `card.moved` — only the `card.created` of the
  // fixture (CL-E36).
  for (const neighbourId of [leftId, rightId]) {
    const events = await storedActivity(handle, neighbourId);

    expect(events.filter((event) => event.type === 'card.moved')).toHaveLength(0);
    expect(events.map((event) => event.type)).toStrictEqual(['card.created']);
  }
});

it('carries via: "drag" on every move event (CL-E35)', async () => {
  const cards = await listPositions();
  const sent = positionBetween(positionOf(cards, leftId), positionOf(cards, moverId));

  await app.inject({
    method: 'PATCH',
    url: `/v1/cards/${moverId}`,
    payload: { position: sent, via: 'drag' },
    ...as(owner),
  });

  const moved = (await storedActivity(handle, moverId)).find(
    (event) => event.type === 'card.moved',
  );

  expect(moved?.payload['via']).toBe('drag');
  expect(moved?.payload['toPosition']).toBe(sent);
});
