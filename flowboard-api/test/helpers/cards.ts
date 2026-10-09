import type { FastifyInstance } from 'fastify';
import type { DatabaseHandle } from '../../src/db/client.js';
import { as, type TestAccount } from './boards.js';

/**
 * Fixtures the FB-06 card files share.
 *
 * Everything that has a route goes through the real route — lists through
 * FB-05, cards through FB-06 — so the rows these tests act on are exactly the
 * rows the API would create. Only the things with no route yet (labels,
 * members, checklist items, comments) are inserted directly.
 */

/** Creates a list through the FB-05 route and returns its id. */
export async function createListAs(
  app: FastifyInstance,
  account: TestAccount,
  boardId: string,
  name: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/boards/${boardId}/lists`,
    payload: { name },
    ...as(account),
  });

  if (response.statusCode !== 201) {
    throw new Error(`createList fixture failed with ${response.statusCode}: ${response.body}`);
  }

  return response.json<{ id: string }>().id;
}

export interface CreatedCard {
  readonly id: string;
  readonly position: number;
  readonly updatedAt: string;
}

/** Creates a card through the FB-06 route and returns the summary fields tests need. */
export async function createCardAs(
  app: FastifyInstance,
  account: TestAccount,
  listId: string,
  title: string,
): Promise<CreatedCard> {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/lists/${listId}/cards`,
    payload: { title },
    ...as(account),
  });

  if (response.statusCode !== 201) {
    throw new Error(`createCard fixture failed with ${response.statusCode}: ${response.body}`);
  }

  return response.json<CreatedCard>();
}

/** The activity rows stored for one card, newest first, read straight from the table. */
export async function storedActivity(
  handle: DatabaseHandle,
  cardId: string,
): Promise<{ type: string; payload: Record<string, unknown>; actor_id: string }[]> {
  return handle.sql`
    select type, payload, actor_id
    from activity_event
    where card_id = ${cardId}
    order by created_at desc, id desc
  ` as unknown as Promise<{ type: string; payload: Record<string, unknown>; actor_id: string }[]>;
}

/** The funnel rows of one type, read straight from the table (BM §13.3). */
export async function storedFunnelEvents(
  handle: DatabaseHandle,
  type: string,
): Promise<{ payload: Record<string, unknown>; user_id: string; workspace_id: string }[]> {
  return handle.sql`
    select payload, user_id, workspace_id
    from funnel_event
    where type = ${type}
    order by created_at
  ` as unknown as Promise<
    { payload: Record<string, unknown>; user_id: string; workspace_id: string }[]
  >;
}

/** Attaches a label to a card (FB-08 owns the route). */
export async function attachLabel(
  handle: DatabaseHandle,
  cardId: string,
  labelId: string,
): Promise<void> {
  await handle.sql`
    insert into card_label (card_id, label_id) values (${cardId}, ${labelId})
    on conflict do nothing
  `;
}

/** Assigns a member to a card (FB-10 owns the route). */
export async function attachMember(
  handle: DatabaseHandle,
  cardId: string,
  userId: string,
): Promise<void> {
  await handle.sql`
    insert into card_member (card_id, user_id) values (${cardId}, ${userId})
    on conflict do nothing
  `;
}

/** Adds a checklist item to a card (FB-11 owns the route). */
export async function addChecklistItem(
  handle: DatabaseHandle,
  cardId: string,
  options: { readonly id: string; readonly text: string; readonly done: boolean; position: number },
): Promise<void> {
  await handle.sql`
    insert into checklist_item (id, card_id, text, done, position)
    values (${options.id}, ${cardId}, ${options.text}, ${options.done}, ${options.position})
  `;
}

/** Adds a comment to a card (FB-12 owns the route). */
export async function addComment(
  handle: DatabaseHandle,
  cardId: string,
  options: { readonly id: string; readonly authorId: string; readonly body: string },
): Promise<void> {
  await handle.sql`
    insert into comment (id, card_id, author_id, body)
    values (${options.id}, ${cardId}, ${options.authorId}, ${options.body})
  `;
}
