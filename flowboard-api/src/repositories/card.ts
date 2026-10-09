import {
  positionAtEnd,
  positionBetween,
  type CardArchivedPayload,
  type CardCreatedPayload,
  type CardDescribedPayload,
  type CardMovedPayload,
  type CardMovedVia,
  type CardRenamedPayload,
  type FunnelEventType,
} from '@flowboard/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { newId } from '../db/id.js';
import {
  activityEventTable,
  boardMemberTable,
  boardTable,
  cardLabelTable,
  cardMemberTable,
  cardTable,
  checklistItemTable,
  commentTable,
  funnelEventTable,
  listTable,
  userTable,
  workspaceMemberTable,
  type CardRow,
  type ChecklistItemRow,
  type ListRow,
} from '../db/schema/index.js';
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type ActivityCursor,
} from '../activity/cursor.js';
import { copyTitle } from '../cards/copy-title.js';
import {
  appendActivityEvent,
  appendActivityEvents,
  type NewActivityEvent,
} from './activity-event.js';
import { planInlineRebalance } from '../positions/rebalance-inline.js';
import type { BoardAccess, HydratedCard } from './board.js';

/**
 * Card persistence for FB-06: create (AC 1), detail (AC 2), patch — title,
 * description and move (AC 3 to 5) — copy (AC 6), archive (AC 7) and the
 * activity feed (AC 8).
 *
 * Every side-effecting route runs in one transaction, so a caller never
 * observes a card moved without its `card.moved`, or a copy whose labels landed
 * but whose checklist did not.
 */

/**
 * A card plus its list and how the caller relates to the board that owns it.
 * This is what the card routes hand to `can()`; resolving it is the only place
 * that reads membership, so no route trusts a client-supplied role
 * (STANDARDS §1.4).
 */
export interface CardAccess extends BoardAccess {
  readonly card: CardRow;
  readonly list: ListRow;
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
 * Loads a card with its list, its board and the caller's roles, in one
 * statement. Returns `null` when the card id does not exist, which the routes
 * answer identically to "not visible" (FB-04 §8 pattern).
 */
export async function findCardAccess(
  db: DbExecutor,
  cardId: string,
  userId: string,
): Promise<CardAccess | null> {
  const rows = await db
    .select({
      card: cardTable,
      list: listTable,
      board: boardTable,
      workspaceRole: workspaceMemberTable.role,
      boardRole: boardMemberTable.role,
    })
    .from(cardTable)
    .innerJoin(listTable, eq(listTable.id, cardTable.listId))
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
    .where(eq(cardTable.id, cardId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const workspaceRole = row.workspaceRole === null ? undefined : asWorkspaceRole(row.workspaceRole);
  const boardRole = row.boardRole === null ? undefined : asBoardRole(row.boardRole);

  return {
    card: row.card,
    list: row.list,
    board: row.board,
    workspaceRole,
    boardRole,
    visible: boardRole !== undefined || workspaceRole === 'admin',
  };
}

/**
 * The per-card aggregates `CardSummary` carries, as scalar subqueries over the
 * join tables — exactly the shape `hydrateBoard` computes for a whole board, so
 * one card fetched after a mutation and the same card fetched by hydration can
 * never disagree about its badge counts (CL-E26).
 */
const summaryColumns = {
  id: cardTable.id,
  listId: cardTable.listId,
  title: cardTable.title,
  position: cardTable.position,
  dueAt: cardTable.dueAt,
  dueComplete: cardTable.dueComplete,
  updatedAt: cardTable.updatedAt,
  hasDescription: sql<boolean>`${cardTable.description} is not null and ${cardTable.description} <> ''`,
  labelIds: sql<string[]>`coalesce((
    select array_agg(${cardLabelTable.labelId}::text order by ${cardLabelTable.labelId})
    from ${cardLabelTable} where ${cardLabelTable.cardId} = ${cardTable.id}
  ), '{}')`,
  memberIds: sql<string[]>`coalesce((
    select array_agg(${cardMemberTable.userId}::text order by ${cardMemberTable.userId})
    from ${cardMemberTable} where ${cardMemberTable.cardId} = ${cardTable.id}
  ), '{}')`,
  checklistTotal: sql<number>`(
    select count(*)::int from ${checklistItemTable}
    where ${checklistItemTable.cardId} = ${cardTable.id}
  )`,
  checklistDone: sql<number>`(
    select count(*)::int from ${checklistItemTable}
    where ${checklistItemTable.cardId} = ${cardTable.id} and ${checklistItemTable.done}
  )`,
  commentCount: sql<number>`(
    select count(*)::int from ${commentTable}
    where ${commentTable.cardId} = ${cardTable.id}
  )`,
} as const;

/**
 * One card in the `CardSummary` shape every mutating route answers with
 * (FB-06 §6). Returns `null` only if the row disappeared between the write and
 * the read.
 */
export async function findCardSummary(
  db: DbExecutor,
  cardId: string,
): Promise<HydratedCard | null> {
  const rows = await db.select(summaryColumns).from(cardTable).where(eq(cardTable.id, cardId));

  const row = rows[0];
  if (row === undefined) return null;

  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    position: row.position,
    dueAt: row.dueAt,
    dueComplete: row.dueComplete,
    updatedAt: row.updatedAt,
    hasDescription: row.hasDescription,
    labelIds: row.labelIds,
    memberIds: row.memberIds,
    checklist: { done: row.checklistDone, total: row.checklistTotal },
    commentCount: row.commentCount,
  };
}

export interface CardDetailRecord {
  readonly card: CardRow;
  readonly boardId: string;
  readonly listName: string;
  readonly labelIds: readonly string[];
  readonly memberIds: readonly string[];
  readonly checklistItems: readonly ChecklistItemRow[];
  readonly commentCount: number;
}

/**
 * Everything the card modal loads lazily (AC 2, CL-E26, CL-E38). Two
 * statements: the card with its scalar aggregates, then the checklist items,
 * which are rows rather than a count and so cannot be folded into the first.
 */
export async function findCardDetail(
  db: DbExecutor,
  cardId: string,
): Promise<CardDetailRecord | null> {
  const rows = await db
    .select({
      card: cardTable,
      boardId: listTable.boardId,
      listName: listTable.name,
      labelIds: summaryColumns.labelIds,
      memberIds: summaryColumns.memberIds,
      commentCount: summaryColumns.commentCount,
    })
    .from(cardTable)
    .innerJoin(listTable, eq(listTable.id, cardTable.listId))
    .where(eq(cardTable.id, cardId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const checklistItems = await db
    .select()
    .from(checklistItemTable)
    .where(eq(checklistItemTable.cardId, cardId))
    .orderBy(asc(checklistItemTable.position), asc(checklistItemTable.id));

  return {
    card: row.card,
    boardId: row.boardId,
    listName: row.listName,
    labelIds: row.labelIds,
    memberIds: row.memberIds,
    checklistItems,
    commentCount: row.commentCount,
  };
}

/** The greatest position among a list's live cards, or `null` when it is empty. */
async function maxLiveCardPosition(tx: DbExecutor, listId: string): Promise<number | null> {
  const [last] = await tx
    .select({ maxPosition: sql<number | null>`max(${cardTable.position})` })
    .from(cardTable)
    .where(and(eq(cardTable.listId, listId), isNull(cardTable.archivedAt)));

  return last?.maxPosition ?? null;
}

export interface CreateCardInput {
  readonly title: string;
  readonly createdBy: string;
  /** Carried into the funnel event, which is workspace-scoped (CL-E40). */
  readonly workspaceId: string;
  readonly boardId: string;
}

/**
 * Appends a card at the bottom of a list (AC 1, C-01) and writes both events
 * the acceptance criterion asks for: the `card.created` activity entry and the
 * `card.created` funnel row (CL-E40, BM §9).
 *
 * An advisory lock per list serialises the read-then-insert, exactly as
 * `createList` does per board, so two cards added in quick succession from the
 * composer — which is the normal way C-01 is used — cannot both read the same
 * maximum and land on the same position.
 */
export async function createCard(
  db: Database,
  listId: string,
  input: CreateCardInput,
): Promise<CardRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${listId}))`);

    const rows = await tx
      .insert(cardTable)
      .values({
        id: newId(),
        listId,
        title: input.title,
        position: positionAtEnd(await maxLiveCardPosition(tx, listId)),
        createdBy: input.createdBy,
      })
      .returning();

    const card = rows[0];
    if (card === undefined) throw new Error('createCard: the card insert returned no row');

    await appendActivityEvent(tx, {
      cardId: card.id,
      actorId: input.createdBy,
      type: 'card.created',
      payload: { title: card.title } satisfies CardCreatedPayload,
    });

    // CL-E40: the activation metric of BM §9 is "time to first card", so the
    // funnel row is written here rather than waiting for FB-18.
    await tx.insert(funnelEventTable).values({
      id: newId(),
      workspaceId: input.workspaceId,
      userId: input.createdBy,
      type: 'card.created' satisfies FunnelEventType,
      payload: { boardId: input.boardId, workspaceId: input.workspaceId },
    });

    return card;
  });
}

/** Why a move was refused, so the route can phrase the `422` (AC 5, CL-E41). */
export type MoveRejection = 'list_not_found' | 'cross_board' | 'list_archived';

export interface CardUpdate {
  readonly title?: string | undefined;
  /** `null` clears the description; `undefined` leaves it alone (AC 4). */
  readonly description?: string | null | undefined;
  readonly listId?: string | undefined;
  readonly position?: number | undefined;
  readonly via: CardMovedVia;
}

export type UpdateCardResult =
  | { readonly outcome: 'updated'; readonly card: CardRow }
  | { readonly outcome: 'gone' }
  | { readonly outcome: 'rejected'; readonly reason: MoveRejection };

/**
 * Takes the container lock of CL-E36: the `list` rows are held `FOR UPDATE` for
 * the rest of the transaction, so two moves into the same list cannot both read
 * the pre-re-balance positions and write conflicting rewrites.
 *
 * The ids are locked in ascending order and the lock is taken **before** the
 * card row is written (CL-E49). FB-07 §6 describes the re-balance as happening
 * after the write, which it still does; acquiring the lock first only removes
 * the lock-ordering cycle between a mover (card row, then its list) and a
 * concurrent re-balance of that list (the list, then its card rows).
 */
async function lockLists(tx: DbExecutor, listIds: readonly string[]): Promise<void> {
  const ordered = [...new Set(listIds)].sort();

  if (ordered.length === 0) return;

  await tx
    .select({ id: listTable.id })
    .from(listTable)
    .where(inArray(listTable.id, ordered))
    .orderBy(asc(listTable.id))
    .for('update');
}

/**
 * The inline re-balance of CL-E36 for one list's live cards.
 *
 * Every card of the list is rewritten at `rebalance(count)` in current
 * `(position, id)` order with a fresh `updatedAt`, and **no** activity event:
 * their rank did not change, only the numbers carrying it (FB-07 AC 8). The
 * bumped `updatedAt` is deliberate — a client holding a stale `If-Match` on a
 * neighbour must re-fetch.
 *
 * Returns the moved card's rewritten row when the re-balance touched it, so the
 * response carries its final position, or `null` when no gap was too small.
 *
 * The caller must already hold the list lock (`lockLists`).
 */
async function rebalanceListCards(
  tx: DbExecutor,
  listId: string,
  movedCardId: string,
): Promise<CardRow | null> {
  const cards = await tx
    .select({ id: cardTable.id, position: cardTable.position })
    .from(cardTable)
    .where(and(eq(cardTable.listId, listId), isNull(cardTable.archivedAt)))
    .orderBy(asc(cardTable.position), asc(cardTable.id));

  const plan = planInlineRebalance(cards);

  if (plan === null) return null;

  const rewrittenAt = new Date();
  let movedCard: CardRow | null = null;

  for (const item of plan) {
    const rows = await tx
      .update(cardTable)
      .set({ position: item.position, updatedAt: rewrittenAt })
      .where(eq(cardTable.id, item.id))
      .returning();

    if (item.id === movedCardId) movedCard = rows[0] ?? null;
  }

  return movedCard;
}

/**
 * Applies a `PATCH` and writes one activity event per field that actually
 * changed (AC 3 to 5, CL-E23, CL-E35, CL-E41), in one transaction.
 *
 * Two deliberate rules:
 *
 * - a field set to the value it already holds changes nothing and writes no
 *   event (AC 3). The card's `updated_at` does not move either: it is the
 *   concurrency token of FS §7.1, and advancing it for a write that changed
 *   nothing would invalidate every other client's `If-Match` for no reason;
 * - the destination list is validated *inside* the transaction against the
 *   card's own board, so a list archived between the request and the write
 *   cannot accept the card.
 */
export async function updateCard(
  db: Database,
  access: CardAccess,
  actorId: string,
  update: CardUpdate,
): Promise<UpdateCardResult> {
  return db.transaction(async (tx) => {
    const current = access.card;
    const values: Record<string, unknown> = {};
    const events: NewActivityEvent[] = [];
    /** The destination list to re-balance after the write (CL-E36), if any. */
    let rebalanceListId: string | null = null;

    if (update.title !== undefined && update.title !== current.title) {
      values['title'] = update.title;
      events.push({
        cardId: current.id,
        actorId,
        type: 'card.renamed',
        payload: { from: current.title, to: update.title } satisfies CardRenamedPayload,
      });
    }

    if (update.description !== undefined) {
      // AC 4: `null` and the empty string both mean "no description", so they
      // are stored identically. Without this, `hasDescription` would depend on
      // which of the two a client happened to send.
      const next =
        update.description === null || update.description === '' ? null : update.description;

      if (next !== current.description) {
        values['description'] = next;
        events.push({
          cardId: current.id,
          actorId,
          type: 'card.described',
          payload: { hasDescription: next !== null } satisfies CardDescribedPayload,
        });
      }
    }

    if (update.position !== undefined) {
      const toListId = update.listId ?? current.listId;

      if (toListId !== current.listId) {
        const [target] = await tx
          .select({ boardId: listTable.boardId, archivedAt: listTable.archivedAt })
          .from(listTable)
          .where(eq(listTable.id, toListId))
          .limit(1);

        // CL-E41: the destination must be a live list on the *same* board. A
        // list on another board is refused rather than silently teleporting the
        // card out of the board the caller was authorised against.
        if (target === undefined) return { outcome: 'rejected', reason: 'list_not_found' } as const;
        if (target.boardId !== access.list.boardId) {
          return { outcome: 'rejected', reason: 'cross_board' } as const;
        }
        if (target.archivedAt !== null) {
          return { outcome: 'rejected', reason: 'list_archived' } as const;
        }
      }

      const moved = toListId !== current.listId || update.position !== current.position;

      if (moved) {
        // CL-E36/CL-E49: hold the destination list (and the source list on a
        // cross-list move, so the two are always taken in the same order)
        // before the card row is written.
        await lockLists(tx, [toListId, current.listId]);

        rebalanceListId = toListId;
        values['listId'] = toListId;
        // CL-E41: the position is stored as sent. The client computed it from
        // the neighbours it can see with the shared position module, and
        // re-deriving it here would fight that.
        values['position'] = update.position;
        events.push({
          cardId: current.id,
          actorId,
          type: 'card.moved',
          payload: {
            fromListId: current.listId,
            toListId,
            fromPosition: current.position,
            toPosition: update.position,
            via: update.via,
          } satisfies CardMovedPayload,
        });
      }
    }

    // Nothing changed: no write, no event, and `updated_at` stays where it is.
    if (Object.keys(values).length === 0) return { outcome: 'updated', card: current } as const;

    values['updatedAt'] = new Date();

    const rows = await tx
      .update(cardTable)
      .set(values)
      .where(and(eq(cardTable.id, current.id), isNull(cardTable.archivedAt)))
      .returning();

    const card = rows[0];

    // Lost a race with a delete between the access check and here.
    if (card === undefined) {
      tx.rollback();
      return { outcome: 'gone' } as const;
    }

    await appendActivityEvents(tx, events);

    // CL-E36: the position has been written; if the destination list now has a
    // gap too small to split, rewrite the whole list in the same transaction.
    // The response carries the moved card's final position (FB-07 §6), which
    // the client compares against the one it sent (FB-07 AC 9).
    if (rebalanceListId !== null) {
      const rebalanced = await rebalanceListCards(tx, rebalanceListId, card.id);

      if (rebalanced !== null) return { outcome: 'updated', card: rebalanced } as const;
    }

    return { outcome: 'updated', card } as const;
  });
}

/**
 * `DELETE /v1/cards/{id}` (AC 7, C-13, CL-A2): a soft delete that writes
 * `card.archived { via: "card" }`. Returns `null` when the card was already
 * archived, which the route answers `404` — a second delete is not an error
 * the user caused, but it is not a success either.
 */
export async function archiveCard(
  db: Database,
  cardId: string,
  actorId: string,
): Promise<CardRow | null> {
  return db.transaction(async (tx) => {
    const archivedAt = new Date();

    const rows = await tx
      .update(cardTable)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(and(eq(cardTable.id, cardId), isNull(cardTable.archivedAt)))
      .returning();

    const card = rows[0];
    if (card === undefined) return null;

    await appendActivityEvent(tx, {
      cardId,
      actorId,
      type: 'card.archived',
      payload: { via: 'card' } satisfies CardArchivedPayload,
    });

    return card;
  });
}

/**
 * `POST /v1/cards/{id}/copy` (AC 6, C-12, CL-A13, CL-E39), in one transaction.
 *
 * Copied: title (fitted with " (copy)"), description, due date and completion,
 * labels, members and checklist items. Not copied: comments and activity —
 * CL-A13 is explicit that a copy starts its own history, which is also why the
 * copy's only activity row is one `card.created` carrying `copiedFromCardId`.
 *
 * No funnel event: BM §9 counts cards a user *composed*, and a copy of an
 * existing card is not evidence of activation (FB-06 §6).
 */
export async function copyCard(db: Database, original: CardRow, actorId: string): Promise<CardRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${original.listId}))`);

    // The card the copy must land in front of. "Strictly greater" rather than
    // the full `(position, id)` keyset so the two neighbours handed to
    // `positionBetween` are always distinct: cards tied on a position — only
    // reachable through a direct insert — sort before the copy instead of
    // making the midpoint undefined.
    const [next] = await tx
      .select({ position: cardTable.position })
      .from(cardTable)
      .where(
        and(
          eq(cardTable.listId, original.listId),
          isNull(cardTable.archivedAt),
          sql`${cardTable.position} > ${original.position}`,
        ),
      )
      .orderBy(asc(cardTable.position), asc(cardTable.id))
      .limit(1);

    const copyId = newId();

    const rows = await tx
      .insert(cardTable)
      .values({
        id: copyId,
        listId: original.listId,
        title: copyTitle(original.title),
        description: original.description,
        position: positionBetween(original.position, next?.position ?? null),
        dueAt: original.dueAt,
        dueComplete: original.dueComplete,
        // CL-E39: the caller owns the copy, not the original's author.
        createdBy: actorId,
      })
      .returning();

    const copy = rows[0];
    if (copy === undefined) throw new Error('copyCard: the card insert returned no row');

    await tx.execute(sql`
      insert into ${cardLabelTable} (card_id, label_id)
      select ${copyId}, ${cardLabelTable.labelId} from ${cardLabelTable}
      where ${cardLabelTable.cardId} = ${original.id}
    `);

    await tx.execute(sql`
      insert into ${cardMemberTable} (card_id, user_id)
      select ${copyId}, ${cardMemberTable.userId} from ${cardMemberTable}
      where ${cardMemberTable.cardId} = ${original.id}
    `);

    const items = await tx
      .select({
        text: checklistItemTable.text,
        done: checklistItemTable.done,
        position: checklistItemTable.position,
      })
      .from(checklistItemTable)
      .where(eq(checklistItemTable.cardId, original.id))
      .orderBy(asc(checklistItemTable.position), asc(checklistItemTable.id));

    if (items.length > 0) {
      await tx.insert(checklistItemTable).values(
        items.map((item) => ({
          id: newId(),
          cardId: copyId,
          text: item.text,
          done: item.done,
          position: item.position,
        })),
      );
    }

    await appendActivityEvent(tx, {
      cardId: copyId,
      actorId,
      type: 'card.created',
      payload: {
        title: copy.title,
        copiedFromCardId: original.id,
      } satisfies CardCreatedPayload,
    });

    return copy;
  });
}

export interface ActivityEventRecord {
  readonly id: string;
  readonly cardId: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
  readonly actor: {
    readonly id: string;
    readonly displayName: string;
    readonly initials: string;
    readonly avatarColor: string;
  };
}

export interface ActivityPageRecord {
  readonly items: readonly ActivityEventRecord[];
  readonly nextCursor: string | null;
}

export { InvalidActivityCursorError } from '../activity/cursor.js';

/**
 * One page of a card's activity, newest first (AC 8, FS §7, CL-E38).
 *
 * The keyset predicate compares the `(created_at, id)` tuple in one expression,
 * and the `ORDER BY` names the same two columns in their native types, so
 * PostgreSQL walks `activity_event_card_created_idx` backwards instead of
 * sorting the card's whole history per page. Casting `id` to `text` here would
 * make the ordering an expression the index cannot provide, which is exactly
 * the regression `test/cards.activity.test.ts` pins with an `EXPLAIN`.
 *
 * `limit + 1` rows are fetched, so the presence of a next page is known without
 * a second `count(*)` over every event on the card.
 */
export async function listCardActivity(
  db: DbExecutor,
  cardId: string,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<ActivityPageRecord> {
  const after: ActivityCursor | null =
    options.cursor === undefined ? null : decodeActivityCursor(options.cursor);

  const keyset =
    after === null
      ? sql`true`
      : sql`(${activityEventTable.createdAt}, ${activityEventTable.id})
            < (${after.createdAt}::timestamptz, ${after.id}::uuid)`;

  // The page is cut *before* the actor join. Joining first would make the
  // planner materialise every event on the card and then sort them to find the
  // newest 50, which is work proportional to the card's whole history on every
  // page; this subquery walks the index in order and stops at `limit + 1`.
  const pageQuery = db
    .select({
      id: activityEventTable.id,
      cardId: activityEventTable.cardId,
      actorId: activityEventTable.actorId,
      type: activityEventTable.type,
      payload: activityEventTable.payload,
      createdAt: activityEventTable.createdAt,
      // The cursor is built from this, not from `createdAt`. PostgreSQL stores
      // `timestamptz` to the microsecond and `now()` resolves to it, but the
      // driver hands JavaScript a `Date`, which only holds milliseconds. A
      // cursor built from the truncated value would sit *before* the row it
      // points at, and the next page's `<` predicate would silently skip every
      // event written in the same millisecond but a later microsecond.
      createdAtCursor:
        sql<string>`to_char(${activityEventTable.createdAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          'created_at_cursor',
        ),
    })
    .from(activityEventTable)
    .where(and(eq(activityEventTable.cardId, cardId), keyset))
    .orderBy(desc(activityEventTable.createdAt), desc(activityEventTable.id))
    .limit(options.limit + 1)
    .as('page');

  const rows = await db
    .select({
      id: pageQuery.id,
      cardId: pageQuery.cardId,
      type: pageQuery.type,
      payload: pageQuery.payload,
      createdAt: pageQuery.createdAt,
      createdAtCursor: pageQuery.createdAtCursor,
      actorId: userTable.id,
      displayName: userTable.displayName,
      initials: userTable.initials,
      avatarColor: userTable.avatarColor,
    })
    .from(pageQuery)
    .innerJoin(userTable, eq(userTable.id, pageQuery.actorId))
    .orderBy(desc(pageQuery.createdAt), desc(pageQuery.id));

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map((row) => ({
      id: row.id,
      cardId: row.cardId,
      type: row.type,
      payload: row.payload as Record<string, unknown>,
      createdAt: row.createdAt,
      actor: {
        id: row.actorId,
        displayName: row.displayName,
        initials: row.initials,
        avatarColor: row.avatarColor,
      },
    })),
    nextCursor:
      hasMore && last !== undefined
        ? encodeActivityCursor({ createdAt: last.createdAtCursor, id: last.id })
        : null,
  };
}
