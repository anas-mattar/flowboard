import { ACTIVITY_PAGE_DEFAULT_LIMIT, ACTIVITY_PAGE_MAX_LIMIT } from '@flowboard/shared';
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
import { createCardAs, createListAs } from './helpers/cards.js';

/** FB-06 AC 8: `GET /v1/cards/{id}/activity` (FS §7, CL-E3, CL-E38). */

interface ActivityItem {
  readonly id: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
  readonly actor: {
    readonly id: string;
    readonly displayName: string;
    readonly initials: string;
    readonly avatarColor: string;
  };
}

interface Page {
  readonly items: ActivityItem[];
  readonly nextCursor: string | null;
}

let handle: DatabaseHandle;
let app: FastifyInstance;
let owner: TestAccount;
let member: TestAccount;
let observer: TestAccount;
let offBoard: TestAccount;
let boardId: string;
let listId: string;
let cardId: string;

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
  member = await signUp(app, 'Omar Haddad');
  observer = await signUp(app, 'Priya Nair');
  offBoard = await signUp(app, 'Tom Becker');

  for (const account of [member, observer, offBoard]) {
    await addWorkspaceMember(handle, owner.workspaceId, account.userId, 'member');
  }

  boardId = await createBoardAs(app, owner, 'Activity board');
  await addBoardMember(handle, boardId, member.userId, 'member');
  await addBoardMember(handle, boardId, observer.userId, 'observer');

  listId = await createListAs(app, owner, boardId, 'To Do');
  cardId = (await createCardAs(app, owner, listId, 'Write launch post')).id;
});

async function activity(options: { account?: TestAccount; query?: string; target?: string } = {}) {
  return app.inject({
    method: 'GET',
    url: `/v1/cards/${options.target ?? cardId}/activity${options.query ?? ''}`,
    ...as(options.account ?? owner),
  });
}

/** Writes `count` extra events by renaming the card, so the feed has history. */
async function renameTimes(count: number, account: TestAccount = owner): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { title: `Title ${index}` },
      ...as(account),
    });

    if (response.statusCode !== 200) {
      throw new Error(`rename fixture failed with ${response.statusCode}: ${response.body}`);
    }
  }
}

describe('ordering and the actor join (AC 8)', () => {
  it('returns the events newest first with the actor as a PublicUser', async () => {
    await renameTimes(1, member);

    const response = await activity();

    expect(response.statusCode).toBe(200);

    const page = response.json<Page>();

    expect(page.items.map((item) => item.type)).toStrictEqual(['card.renamed', 'card.created']);
    expect(page.nextCursor).toBeNull();

    const [renamed, created] = page.items;

    expect(renamed?.actor.id).toBe(member.userId);
    expect(renamed?.actor.displayName).toBe('Omar Haddad');
    expect(renamed?.actor.initials).toBe('OH');
    expect(renamed?.actor.avatarColor).toMatch(/^#[0-9a-f]{6}$/u);
    expect(created?.actor.id).toBe(owner.userId);
    expect(created?.payload).toStrictEqual({ title: 'Write launch post' });
  });

  it('is strictly descending by (createdAt, id), even for one transaction’s events', async () => {
    // One PATCH writes a rename and a move inside a single transaction, so the
    // two events share `created_at` exactly and only `id` separates them.
    await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      payload: { title: 'Renamed and moved', position: 512 },
      ...as(owner),
    });

    const page = (await activity()).json<Page>();

    expect(page.items).toHaveLength(3);

    for (let index = 1; index < page.items.length; index += 1) {
      const previous = page.items[index - 1];
      const current = page.items[index];
      const previousAt = Date.parse(previous?.createdAt ?? '');
      const currentAt = Date.parse(current?.createdAt ?? '');

      expect(previousAt).toBeGreaterThanOrEqual(currentAt);

      if (previousAt === currentAt) {
        expect(previous?.id.localeCompare(current?.id ?? '')).toBeGreaterThan(0);
      }
    }
  });

  it('shows only this card’s events', async () => {
    const other = await createCardAs(app, owner, listId, 'Another card');

    expect((await activity()).json<Page>().items).toHaveLength(1);
    expect((await activity({ target: other.id })).json<Page>().items).toHaveLength(1);
  });
});

describe('pagination and the cursor (AC 8, CL-E38)', () => {
  it(`defaults to ${ACTIVITY_PAGE_DEFAULT_LIMIT} per page`, async () => {
    // 1 create + 60 renames = 61 events.
    await renameTimes(60);

    const page = (await activity()).json<Page>();

    expect(page.items).toHaveLength(ACTIVITY_PAGE_DEFAULT_LIMIT);
    expect(page.nextCursor).not.toBeNull();
  });

  it('walks the whole feed without repeating or skipping an event', async () => {
    await renameTimes(11);

    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const query: string = `?limit=5${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const page: Page = (await activity({ query })).json<Page>();

      expect(page.items.length).toBeLessThanOrEqual(5);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it('does not skip events written in the same millisecond but a later microsecond', async () => {
    // PostgreSQL stores `timestamptz` to the microsecond; a JavaScript `Date`
    // holds milliseconds. A cursor built from the truncated value sits *before*
    // the row it points at, and the next page's `<` predicate then drops every
    // event between the two. These six share a millisecond and differ only in
    // microseconds, which is what a burst of writes under load looks like.
    await handle.sql`
      insert into activity_event (id, card_id, actor_id, type, payload, created_at)
      select gen_random_uuid(), ${cardId}, ${owner.userId}, 'card.renamed',
             jsonb_build_object('from', 'a', 'to', 'b'),
             timestamptz '2026-10-09 12:00:00.123000+00' + (generations.n || ' microseconds')::interval
      from generate_series(1, 6) as generations(n)
    `;

    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const query: string = `?limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const page: Page = (await activity({ query })).json<Page>();

      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    // Six synthetic events plus the fixture's `card.created`.
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('returns a null cursor on the last page', async () => {
    await renameTimes(4);

    const page = (await activity({ query: '?limit=10' })).json<Page>();

    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it(`caps the limit at ${ACTIVITY_PAGE_MAX_LIMIT}`, async () => {
    expect((await activity({ query: `?limit=${ACTIVITY_PAGE_MAX_LIMIT}` })).statusCode).toBe(200);
    expect((await activity({ query: `?limit=${ACTIVITY_PAGE_MAX_LIMIT + 1}` })).statusCode).toBe(
      422,
    );
  });

  it('refuses a bad limit with 422', async () => {
    for (const query of ['?limit=0', '?limit=-1', '?limit=1.5', '?limit=many']) {
      expect((await activity({ query })).statusCode).toBe(422);
    }
  });

  it('refuses a cursor it did not produce with 422, not a 500', async () => {
    for (const cursor of ['nonsense', '!!!!', Buffer.from('["a"]').toString('base64url')]) {
      const response = await activity({ query: `?cursor=${encodeURIComponent(cursor)}` });

      expect(response.statusCode).toBe(422);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_failed');
    }
  });

  it('refuses an unknown query parameter with 422', async () => {
    expect((await activity({ query: '?order=asc' })).statusCode).toBe(422);
  });
});

describe('who may read the feed (AC 8, AC 9)', () => {
  it('lets every board role read it, Observer included', async () => {
    for (const account of [owner, member, observer]) {
      expect((await activity({ account })).statusCode).toBe(200);
    }
  });

  it('returns 404 to a workspace member who is not on the board', async () => {
    expect((await activity({ account: offBoard })).statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}/activity` });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for a card that does not exist', async () => {
    expect((await activity({ target: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(
      404,
    );
  });
});

describe('the index serves the feed (FB-06 §7)', () => {
  /**
   * The spec asks for the query plan on a card with 1,000 events. A card
   * holding *every* row in the table is not that measurement — the planner
   * rightly reads 1,000 rows sequentially when they are the whole table — so
   * the busy card's history is surrounded by an order of magnitude more events
   * on other cards, which is the shape a real board has.
   */
  beforeEach(async () => {
    const noisyCardId = (await createCardAs(app, owner, listId, 'Noisy neighbour')).id;

    // 999 more on the card under test (one `card.created` already exists), and
    // 20,000 spread over another card.
    await handle.sql`
      insert into activity_event (id, card_id, actor_id, type, payload, created_at)
      select gen_random_uuid(), ${cardId}, ${owner.userId}, 'card.renamed',
             jsonb_build_object('from', 'a', 'to', 'b'),
             now() - (generations.n || ' seconds')::interval
      from generate_series(1, 999) as generations(n)
    `;

    await handle.sql`
      insert into activity_event (id, card_id, actor_id, type, payload, created_at)
      select gen_random_uuid(), ${noisyCardId}, ${owner.userId}, 'card.renamed',
             jsonb_build_object('from', 'a', 'to', 'b'),
             now() - (generations.n || ' seconds')::interval
      from generate_series(1, 20000) as generations(n)
    `;

    await handle.sql`analyze activity_event`;
    // 21,000 inserts plus `analyze` run in about two seconds on an idle
    // machine, but this is the one fixture in the suite whose cost is not
    // bounded by a handful of HTTP requests, so it gets its own budget rather
    // than tripping the 30-second default on a loaded CI runner.
  }, 180_000);

  it('reads the first page of a 1,000-event card through the index', async () => {
    // The same shape `listCardActivity` builds: the page is cut before the
    // actor join, and the `ORDER BY` names `(created_at, id)` in their native
    // types so the index can provide the ordering.
    const plan = (await handle.sql`
      explain (analyze, buffers, format text)
      select page.id, page.card_id, page.type, page.payload, page.created_at,
             u.id, u.display_name, u.initials, u.avatar_color
      from (
        select * from activity_event
        where card_id = ${cardId}
        order by created_at desc, id desc
        limit 51
      ) as page
      join "user" u on u.id = page.actor_id
      order by page.created_at desc, page.id desc
    `) as unknown as { 'QUERY PLAN': string }[];

    const text = plan.map((row) => row['QUERY PLAN']).join('\n');

    // The card predicate *and* the ordering come from
    // `activity_event_card_created_idx`: an ordered index scan, not a bitmap
    // scan of the card's whole history followed by a sort (FS §8, FB-06 §7).
    expect(text).toMatch(/Index Scan .*using activity_event_card_created_idx/u);
    expect(text).not.toMatch(/Seq Scan on activity_event/u);
    expect(text).not.toMatch(/Bitmap/u);

    // The decisive measurement: one page costs a page's worth of rows, not the
    // 1,000 events the card holds.
    const scanned = [...text.matchAll(/actual time=[\d.]+\.\.[\d.]+ rows=(\d+)/gu)].map((match) =>
      Number(match[1]),
    );

    expect(Math.max(...scanned)).toBeLessThanOrEqual(51);
  });

  it('still answers the first page and a following page from the route', async () => {
    const first = (await activity()).json<Page>();

    expect(first.items).toHaveLength(ACTIVITY_PAGE_DEFAULT_LIMIT);
    expect(first.nextCursor).not.toBeNull();

    const second = (
      await activity({ query: `?cursor=${encodeURIComponent(first.nextCursor ?? '')}` })
    ).json<Page>();

    expect(second.items).toHaveLength(ACTIVITY_PAGE_DEFAULT_LIMIT);

    const firstIds = new Set(first.items.map((item) => item.id));

    expect(second.items.some((item) => firstIds.has(item.id))).toBe(false);
  });
});
