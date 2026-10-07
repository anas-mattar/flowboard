import {
  positionAtEnd,
  rebalance,
  sortByDueWithMoves,
  type CardArchivedPayload,
  type CardArchivedVia,
  type CardMovedPayload,
} from '@flowboard/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { newId } from '../db/id.js';
import {
  boardMemberTable,
  boardTable,
  cardTable,
  listTable,
  workspaceMemberTable,
  type ListRow,
} from '../db/schema/index.js';
import { appendActivityEvents } from './activity-event.js';
import type { BoardAccess } from './board.js';

/**
 * List persistence for FB-05: create (AC 1), patch (AC 2 to 4), delete with its
 * cards (AC 7, CL-E34), archive all cards (AC 6) and sort by due date
 * (AC 5, CL-A14).
 *
 * The three side-effecting routes each run in one transaction, so a caller
 * never observes a list archived without its cards, or positions rewritten
 * without the matching activity events.
 */

/**
 * A list plus how the caller relates to the board that owns it. This is what
 * the list routes hand to `can()`; resolving it is the only place that reads
 * membership, so no route trusts a client-supplied role (STANDARDS §1.4).
 */
export interface ListAccess extends BoardAccess {
  readonly list: ListRow;
}

/**
 * Loads a list with its board and the caller's roles, in one statement.
 * Returns `null` when the list id does not exist, which the routes answer
 * identically to "not visible" (FB-04 §8 pattern).
 */
export async function findListAccess(
  db: DbExecutor,
  listId: string,
  userId: string,
): Promise<ListAccess | null> {
  const rows = await db
    .select({
      list: listTable,
      board: boardTable,
      workspaceRole: workspaceMemberTable.role,
      boardRole: boardMemberTable.role,
    })
    .from(listTable)
    .innerJoin(boardTable, eq(boardTable.id, listTable.boardId))
    .leftJoin(
      workspaceMemberTable,
      and(
        eq(workspaceMemberTable.workspaceId, boardTable.workspaceId),
        eq(workspaceMemberTable.userId, userId),
      ),
    )
    .leftJoin(
      boardMemberTable,
      and(eq(boardMemberTable.boardId, boardTable.id), eq(boardMemberTable.userId, userId)),
    )
    .where(eq(listTable.id, listId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const workspaceRole = row.workspaceRole === null ? undefined : asWorkspaceRole(row.workspaceRole);
  const boardRole = row.boardRole === null ? undefined : asBoardRole(row.boardRole);

  return {
    list: row.list,
    board: row.board,
    workspaceRole,
    boardRole,
    visible: boardRole !== undefined || workspaceRole === 'admin',
  };
}

/** Narrowed from the `text` columns their CHECK constraints guard. */
function asBoardRole(role: string): BoardAccess['boardRole'] {
  if (role === 'admin' || role === 'member' || role === 'observer') return role;

  throw new Error(`board_member.role holds an unexpected value: ${role}`);
}

function asWorkspaceRole(role: string): BoardAccess['workspaceRole'] {
  if (role === 'admin' || role === 'member') return role;

  throw new Error(`workspace_member.role holds an unexpected value: ${role}`);
}

/**
 * Appends a list at the right end of the board (AC 1, L-01).
 *
 * The position is `positionAtEnd(max position of the board's live lists)`, so a
 * board with no lists starts at 1024 and the fourth list of a default board
 * lands at 4096. Archived lists are excluded from the maximum: a restored list
 * (FB-17) keeps its old position and simply sorts where it used to be.
 *
 * An advisory lock per board serialises the read-then-insert, so two concurrent
 * "Add another list" clicks cannot both read the same maximum and land on the
 * same position. The lock is transaction scoped and keyed on the board, so
 * creates on other boards never queue behind it.
 */
export async function createList(
  db: Database,
  boardId: string,
  input: { readonly name: string },
): Promise<ListRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${boardId}))`);

    const [last] = await tx
      .select({ maxPosition: sql<number | null>`max(${listTable.position})` })
      .from(listTable)
      .where(and(eq(listTable.boardId, boardId), isNull(listTable.archivedAt)));

    const rows = await tx
      .insert(listTable)
      .values({
        id: newId(),
        boardId,
        name: input.name,
        position: positionAtEnd(last?.maxPosition ?? null),
      })
      .returning();

    const list = rows[0];
    if (list === undefined) throw new Error('createList: the list insert returned no row');

    return list;
  });
}

export interface ListUpdate {
  readonly name?: string | undefined;
  readonly position?: number | undefined;
  /** `null` clears the limit; `undefined` leaves it alone (AC 4). */
  readonly wipLimit?: number | null | undefined;
}

/**
 * Applies the patch and moves `updatedAt` (FS §7.1). A `position`-only patch is
 * a list edit and bumps `updatedAt` too (FB-05 §6), so the next `If-Match`
 * reflects the reorder.
 *
 * Returns `null` only if the row disappeared between the access check and the
 * write.
 */
export async function updateList(
  db: DbExecutor,
  listId: string,
  update: ListUpdate,
): Promise<ListRow | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (update.name !== undefined) values['name'] = update.name;
  if (update.position !== undefined) values['position'] = update.position;
  // `null` is a meaningful value here, so the guard is `!== undefined`.
  if (update.wipLimit !== undefined) values['wipLimit'] = update.wipLimit;

  const rows = await db.update(listTable).set(values).where(eq(listTable.id, listId)).returning();

  return rows[0] ?? null;
}

/** The live cards of one list, in rank order `(position, id)`. */
async function liveCardsInRankOrder(
  tx: DbExecutor,
  listId: string,
): Promise<{ id: string; position: number; dueAt: Date | null }[]> {
  return tx
    .select({ id: cardTable.id, position: cardTable.position, dueAt: cardTable.dueAt })
    .from(cardTable)
    .where(and(eq(cardTable.listId, listId), isNull(cardTable.archivedAt)))
    .orderBy(asc(cardTable.position), asc(cardTable.id));
}

/**
 * Archives every live card of a list at one timestamp and writes one
 * `card.archived` per card (CL-E34).
 *
 * `archivedAt` is passed in rather than read from the clock here, which is what
 * lets `deleteList` give the list and its cards the *same* instant (AC 7).
 * Cards archived earlier are untouched: the `archived_at is null` predicate
 * leaves their original timestamp in place so FB-17 restores each batch
 * separately.
 */
async function archiveLiveCards(
  tx: DbExecutor,
  listId: string,
  actorId: string,
  archivedAt: Date,
  via: CardArchivedVia,
): Promise<string[]> {
  const archived = await tx
    .update(cardTable)
    .set({ archivedAt, updatedAt: archivedAt })
    .where(and(eq(cardTable.listId, listId), isNull(cardTable.archivedAt)))
    .returning({ id: cardTable.id });

  const cardIds = archived.map((card) => card.id);

  await appendActivityEvents(
    tx,
    cardIds.map((cardId) => ({
      cardId,
      actorId,
      type: 'card.archived' as const,
      payload: { via } satisfies CardArchivedPayload,
    })),
  );

  return cardIds;
}

/**
 * `POST /v1/lists/{id}/archive-cards` (AC 6, CL-E24). The list itself stays
 * live; only its cards are archived, with `via: "archive_all"`.
 */
export async function archiveListCards(
  db: Database,
  listId: string,
  actorId: string,
): Promise<string[]> {
  return db.transaction(async (tx) =>
    archiveLiveCards(tx, listId, actorId, new Date(), 'archive_all'),
  );
}

export interface DeletedList {
  readonly list: ListRow;
  readonly archivedCardIds: readonly string[];
}

/**
 * `DELETE /v1/lists/{id}` (AC 7, CL-E2, CL-E34): the list and each of its live
 * cards get **the same** `archived_at`, and every card gets a `card.archived`
 * with `via: "list_archived"`, in one transaction.
 *
 * The shared timestamp is the join key FB-17 restores on — "undo this delete"
 * is "restore the list and the cards archived at the same instant" — so it is
 * computed once here rather than per statement.
 */
export async function deleteList(
  db: Database,
  listId: string,
  actorId: string,
): Promise<DeletedList | null> {
  return db.transaction(async (tx) => {
    const archivedAt = new Date();

    const archivedCardIds = await archiveLiveCards(
      tx,
      listId,
      actorId,
      archivedAt,
      'list_archived',
    );

    const rows = await tx
      .update(listTable)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(and(eq(listTable.id, listId), isNull(listTable.archivedAt)))
      .returning();

    const list = rows[0];

    // Another request archived the list between the access check and here; the
    // transaction rolls back so its cards are not archived twice.
    if (list === undefined) {
      tx.rollback();
      return null;
    }

    return { list, archivedCardIds };
  });
}

/**
 * `POST /v1/lists/{id}/sort-by-due` (AC 5, L-05, CL-A14, CL-E35).
 *
 * A one-off rewrite, not a stored sort order: the cards are read in their
 * current rank order, sorted with the comparator `flowboard-shared` also gives
 * the web app, and written back at `rebalance(count)` positions. Every card's
 * position is rewritten, but only the cards whose **rank** changed get a
 * `card.moved`, which is what makes a second call a genuine no-op.
 */
export async function sortListByDue(
  db: Database,
  listId: string,
  actorId: string,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const cards = await liveCardsInRankOrder(tx, listId);

    const { ordered, movedCardIds } = sortByDueWithMoves(cards);

    // Nothing to do: no rank changed, so no position is rewritten and no event
    // is written (AC 5, the idempotent second call).
    if (movedCardIds.length === 0) return [];

    const positions = rebalance(ordered.length);
    const movedAt = new Date();
    const events: CardMovedEvent[] = [];

    for (const [index, card] of ordered.entries()) {
      const toPosition = positions[index];
      if (toPosition === undefined)
        throw new Error('sortListByDue: rebalance returned too few positions');

      await tx
        .update(cardTable)
        .set({ position: toPosition, updatedAt: movedAt })
        .where(eq(cardTable.id, card.id));

      if (!movedCardIds.includes(card.id)) continue;

      events.push({
        cardId: card.id,
        actorId,
        type: 'card.moved',
        payload: {
          // A sort never leaves the list, so from and to are the same (CL-E35).
          fromListId: listId,
          toListId: listId,
          fromPosition: card.position,
          toPosition,
          via: 'sort',
        },
      });
    }

    await appendActivityEvents(tx, events);

    return [...movedCardIds];
  });
}

interface CardMovedEvent {
  readonly cardId: string;
  readonly actorId: string;
  readonly type: 'card.moved';
  readonly payload: CardMovedPayload;
}

/** The number of live cards in a list, for the WIP pill (CL-A17). */
export async function countListCards(db: DbExecutor, listId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardTable)
    .where(and(eq(cardTable.listId, listId), isNull(cardTable.archivedAt)));

  return rows[0]?.count ?? 0;
}
