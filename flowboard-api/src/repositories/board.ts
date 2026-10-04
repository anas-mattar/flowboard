import {
  DEFAULT_LABELS,
  DEFAULT_LISTS,
  POSITION_STEP,
  nextBoardColor,
  type BoardRole,
  type FunnelEventType,
  type WorkspaceRole,
} from '@flowboard/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { newId } from '../db/id.js';
import {
  boardMemberTable,
  boardStarTable,
  boardTable,
  cardLabelTable,
  cardMemberTable,
  cardTable,
  checklistItemTable,
  commentTable,
  funnelEventTable,
  labelTable,
  listTable,
  userTable,
  workspaceMemberTable,
  type BoardRow,
  type LabelRow,
  type ListRow,
} from '../db/schema/index.js';
import {
  decodeBoardCursor,
  encodeBoardCursor,
  starredRank,
  type BoardCursor,
} from '../boards/ordering.js';

/**
 * Board persistence for FB-04: the sidebar page (CL-E17), the creation
 * transaction (CL-A7, CL-D3, CL-E20), the single hydration read (FS §7) and
 * the patch (CL-E14 to CL-E18).
 *
 * Every function takes a `DbExecutor` so the same code runs standalone and
 * inside a transaction, as `repositories/account.ts` already does.
 */

/** Board roles, narrowed from the `text` column its CHECK constrains. */
function asBoardRole(role: string): BoardRole {
  if (role === 'admin' || role === 'member' || role === 'observer') return role;

  throw new Error(`board_member.role holds an unexpected value: ${role}`);
}

function asWorkspaceRole(role: string): WorkspaceRole {
  if (role === 'admin' || role === 'member') return role;

  throw new Error(`workspace_member.role holds an unexpected value: ${role}`);
}

/**
 * How the caller relates to one board. This is the input the route hands to
 * `can()`; resolving it is the only place that reads membership, so no route
 * ever trusts a client-supplied role (STANDARDS §1.4).
 *
 * `visible` is false when the caller is neither a board member nor an admin of
 * the owning workspace, which the routes turn into `404` rather than `403`:
 * FB-04 §8 does not let a non-member learn that a board id exists.
 */
export interface BoardAccess {
  readonly board: BoardRow;
  readonly workspaceRole: WorkspaceRole | undefined;
  readonly boardRole: BoardRole | undefined;
  readonly visible: boolean;
}

/**
 * Loads a board with the caller's roles on it and in its workspace.
 * Returns `null` when the board id does not exist at all, which the routes
 * answer identically to "not visible".
 */
export async function findBoardAccess(
  db: DbExecutor,
  boardId: string,
  userId: string,
): Promise<BoardAccess | null> {
  const rows = await db
    .select({
      board: boardTable,
      workspaceRole: workspaceMemberTable.role,
      boardRole: boardMemberTable.role,
    })
    .from(boardTable)
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
    .where(eq(boardTable.id, boardId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const workspaceRole = row.workspaceRole === null ? undefined : asWorkspaceRole(row.workspaceRole);
  const boardRole = row.boardRole === null ? undefined : asBoardRole(row.boardRole);

  return {
    board: row.board,
    workspaceRole,
    boardRole,
    // CL-E17: a board member of any role, or an admin of the owning workspace.
    // A workspace *member* who is not on the board cannot see it (FB-04 §8).
    visible: boardRole !== undefined || workspaceRole === 'admin',
  };
}

/** Whether the caller has starred this board (CL-E14). */
export async function isStarred(db: DbExecutor, boardId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ boardId: boardStarTable.boardId })
    .from(boardStarTable)
    .where(and(eq(boardStarTable.boardId, boardId), eq(boardStarTable.userId, userId)))
    .limit(1);

  return rows.length > 0;
}

export interface BoardSummaryRow {
  readonly board: BoardRow;
  readonly starred: boolean;
  readonly cardCount: number;
}

export interface BoardPage {
  readonly items: readonly BoardSummaryRow[];
  readonly nextCursor: string | null;
}

export { InvalidCursorError } from '../boards/ordering.js';

/**
 * One page of the sidebar (B-01, CL-E17, AC 2, AC 3).
 *
 * Written as one statement with a lateral count rather than a board query plus
 * a count per board, so a workspace with fifty boards still costs one round
 * trip. The count subquery joins `list` and `card` on their partial
 * `archived_at is null` indexes (`card_list_active_idx`), which is what keeps
 * it off a sequential scan on the seeded data.
 *
 * `limit + 1` rows are fetched so the presence of a next page is known without
 * a second `count(*)` over the whole visible set.
 */
export async function listBoards(
  db: DbExecutor,
  userId: string,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<BoardPage> {
  const after: BoardCursor | null =
    options.cursor === undefined ? null : decodeBoardCursor(options.cursor);

  const keyset =
    after === null
      ? sql`true`
      : sql`(
          case when ${boardStarTable.boardId} is null then 1 else 0 end,
          lower(${boardTable.name}),
          ${boardTable.id}::text
        ) > (${starredRank(after.starred)}, ${after.lowerName}, ${after.id})`;

  const rows = await db
    .select({
      board: boardTable,
      starred: sql<boolean>`${boardStarTable.boardId} is not null`,
      // The cursor must carry the *database's* fold, not JavaScript's. Postgres
      // `lower()` under the `C` locale folds ASCII only, while
      // `String#toLowerCase` folds the whole of Unicode, so re-folding here
      // would make the next page's keyset predicate compare `évaluation`
      // against a boundary the `ORDER BY` never produced — skipping or
      // repeating a row (FS §7).
      lowerName: sql<string>`lower(${boardTable.name})`,
      cardCount: sql<number>`(
        select count(*)::int
        from ${listTable}
        join ${cardTable} on ${cardTable.listId} = ${listTable.id}
          and ${cardTable.archivedAt} is null
        where ${listTable.boardId} = ${boardTable.id}
          and ${listTable.archivedAt} is null
      )`,
    })
    .from(boardTable)
    // CL-E17 visibility: on the board, or an admin of the owning workspace.
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
    .leftJoin(
      boardStarTable,
      and(eq(boardStarTable.boardId, boardTable.id), eq(boardStarTable.userId, userId)),
    )
    .where(
      and(
        isNull(boardTable.archivedAt),
        sql`(${boardMemberTable.userId} is not null or ${workspaceMemberTable.role} = 'admin')`,
        keyset,
      ),
    )
    .orderBy(
      sql`case when ${boardStarTable.boardId} is null then 1 else 0 end`,
      sql`lower(${boardTable.name})`,
      sql`${boardTable.id}::text`,
    )
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map((row) => ({
      board: row.board,
      starred: row.starred,
      cardCount: row.cardCount,
    })),
    nextCursor:
      hasMore && last !== undefined
        ? encodeBoardCursor({
            starred: last.starred,
            lowerName: last.lowerName,
            id: last.board.id,
          })
        : null,
  };
}

/** The number of cards the sidebar shows for one board (CL-E17). */
export async function countBoardCards(db: DbExecutor, boardId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardTable)
    .innerJoin(listTable, eq(listTable.id, cardTable.listId))
    .where(
      and(
        eq(listTable.boardId, boardId),
        isNull(listTable.archivedAt),
        isNull(cardTable.archivedAt),
      ),
    );

  return rows[0]?.count ?? 0;
}

/** Whether `userId` is a member of `workspaceId`, and with which role. */
export async function findWorkspaceRole(
  db: DbExecutor,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const rows = await db
    .select({ role: workspaceMemberTable.role })
    .from(workspaceMemberTable)
    .where(
      and(
        eq(workspaceMemberTable.workspaceId, workspaceId),
        eq(workspaceMemberTable.userId, userId),
      ),
    )
    .limit(1);

  const role = rows[0]?.role;

  return role === undefined ? null : asWorkspaceRole(role);
}

export interface CreateBoardInput {
  readonly name: string;
  readonly workspaceId: string;
  readonly createdBy: string;
}

export interface CreatedBoard {
  readonly board: BoardRow;
  readonly lists: readonly ListRow[];
  readonly labels: readonly LabelRow[];
}

/**
 * Creates a board with everything B-02 promises, in one transaction (AC 1):
 * the board, the creator as board `admin`, the three default lists at
 * 1024/2048/3072 with WIP 3 on Doing (CL-A7), the six default labels (CL-D3)
 * and the `board.created` funnel event (CL-E20).
 *
 * Anything that throws inside leaves no rows at all, so a half-built board —
 * one with no lists, which the board page cannot render — is not reachable.
 */
export async function createBoard(
  db: Database,
  input: CreateBoardInput,
  hooks: { onAfterBoardInsert?: () => Promise<void> | void } = {},
): Promise<CreatedBoard> {
  return db.transaction(async (tx) => {
    // Serialise colour assignment per workspace. Without this, two concurrent
    // `POST /v1/boards` read the same count and pick the same colour, which is
    // exactly what CL-A12 asks the cycle to avoid. The lock is transaction
    // scoped, so it is released on commit or rollback with no explicit unlock,
    // and it is keyed on the workspace, so creates in other workspaces never
    // queue behind it. Cosmetic contention only: the critical section is the
    // count plus the insert.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}))`);

    // CL-A12: cycle the palette by boards *ever* created in the workspace, so
    // archiving one does not make the next board reuse a neighbour's colour.
    const [existing] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(boardTable)
      .where(eq(boardTable.workspaceId, input.workspaceId));

    const boardId = newId();

    const insertedBoards = await tx
      .insert(boardTable)
      .values({
        id: boardId,
        workspaceId: input.workspaceId,
        name: input.name,
        color: nextBoardColor(existing?.count ?? 0),
        createdBy: input.createdBy,
      })
      .returning();

    const board = insertedBoards[0];
    if (board === undefined) throw new Error('createBoard: the board insert returned no row');

    await hooks.onAfterBoardInsert?.();

    // B-02: the creator is the board admin.
    await tx.insert(boardMemberTable).values({
      boardId,
      userId: input.createdBy,
      role: 'admin' satisfies BoardRole,
    });

    const labels = await tx
      .insert(labelTable)
      .values(
        DEFAULT_LABELS.map((label) => ({
          id: newId(),
          boardId,
          name: label.name,
          color: label.color,
        })),
      )
      .returning();

    const lists = await tx
      .insert(listTable)
      .values(
        DEFAULT_LISTS.map((list, index) => ({
          id: newId(),
          boardId,
          name: list.name,
          position: (index + 1) * POSITION_STEP,
          wipLimit: list.wipLimit,
        })),
      )
      .returning();

    await tx.insert(funnelEventTable).values({
      id: newId(),
      workspaceId: input.workspaceId,
      userId: input.createdBy,
      type: 'board.created' satisfies FunnelEventType,
      payload: {},
    });

    return { board, lists, labels };
  });
}

export interface HydratedList {
  readonly list: ListRow;
  readonly cards: readonly HydratedCard[];
}

export interface HydratedCard {
  readonly id: string;
  readonly listId: string;
  readonly title: string;
  readonly position: number;
  readonly dueAt: Date | null;
  readonly dueComplete: boolean;
  readonly updatedAt: Date;
  readonly hasDescription: boolean;
  readonly labelIds: readonly string[];
  readonly memberIds: readonly string[];
  readonly checklist: { readonly done: number; readonly total: number };
  readonly commentCount: number;
}

export interface BoardMemberRecord {
  readonly role: BoardRole;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly initials: string;
    readonly avatarColor: string;
  };
}

export interface BoardHydration {
  readonly members: readonly BoardMemberRecord[];
  readonly labels: readonly LabelRow[];
  readonly lists: readonly HydratedList[];
}

/**
 * Everything the board page needs, in one call (FS §7, AC 4).
 *
 * Three statements rather than one: members, labels, and lists-with-cards. A
 * single joined statement would multiply each card row by its labels and
 * members and send the card title once per combination, which is the shape
 * FS §8 performance asks us to avoid on a 1,000-card board. The per-card
 * aggregates are computed in the card statement as scalar subqueries over the
 * join tables, so the number of round trips stays constant in the board size.
 */
export async function hydrateBoard(db: DbExecutor, boardId: string): Promise<BoardHydration> {
  const members = await db
    .select({
      role: boardMemberTable.role,
      id: userTable.id,
      displayName: userTable.displayName,
      initials: userTable.initials,
      avatarColor: userTable.avatarColor,
    })
    .from(boardMemberTable)
    .innerJoin(userTable, eq(userTable.id, boardMemberTable.userId))
    .where(eq(boardMemberTable.boardId, boardId))
    .orderBy(userTable.displayName, userTable.id);

  const labels = await db
    .select()
    .from(labelTable)
    .where(eq(labelTable.boardId, boardId))
    .orderBy(labelTable.name, labelTable.id);

  const lists = await db
    .select()
    .from(listTable)
    .where(and(eq(listTable.boardId, boardId), isNull(listTable.archivedAt)))
    .orderBy(listTable.position, listTable.id);

  const cards =
    lists.length === 0
      ? []
      : await db
          .select({
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
          })
          .from(cardTable)
          .innerJoin(listTable, eq(listTable.id, cardTable.listId))
          .where(
            and(
              eq(listTable.boardId, boardId),
              isNull(listTable.archivedAt),
              isNull(cardTable.archivedAt),
            ),
          )
          .orderBy(cardTable.listId, cardTable.position, cardTable.id);

  const cardsByList = new Map<string, HydratedCard[]>();

  for (const card of cards) {
    const bucket = cardsByList.get(card.listId) ?? [];

    bucket.push({
      id: card.id,
      listId: card.listId,
      title: card.title,
      position: card.position,
      dueAt: card.dueAt,
      dueComplete: card.dueComplete,
      updatedAt: card.updatedAt,
      hasDescription: card.hasDescription,
      labelIds: card.labelIds,
      memberIds: card.memberIds,
      checklist: { done: card.checklistDone, total: card.checklistTotal },
      commentCount: card.commentCount,
    });

    cardsByList.set(card.listId, bucket);
  }

  return {
    members: members.map((member) => ({
      role: asBoardRole(member.role),
      user: {
        id: member.id,
        displayName: member.displayName,
        initials: member.initials,
        avatarColor: member.avatarColor,
      },
    })),
    labels,
    lists: lists.map((list) => ({ list, cards: cardsByList.get(list.id) ?? [] })),
  };
}

export interface BoardUpdate {
  readonly name?: string | undefined;
  readonly color?: string | undefined;
  readonly archived?: boolean | undefined;
}

/**
 * Applies the board-level fields of `PATCH` and moves `updatedAt` (FS §7.1).
 * Returns `null` when nothing was changed, which only happens if the row
 * disappeared between the access check and the write.
 */
export async function updateBoard(
  db: DbExecutor,
  boardId: string,
  update: BoardUpdate,
): Promise<BoardRow | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (update.name !== undefined) values['name'] = update.name;
  if (update.color !== undefined) values['color'] = update.color;
  // CL-E16: archiving sets `archived_at` on the board only; the lists and
  // cards keep their own `archived_at` untouched so FB-17 restores exactly.
  if (update.archived !== undefined) values['archivedAt'] = update.archived ? new Date() : null;

  const rows = await db
    .update(boardTable)
    .set(values)
    .where(eq(boardTable.id, boardId))
    .returning();

  return rows[0] ?? null;
}

/**
 * Adds or removes the caller's star (CL-E14, AC 6). Starring is idempotent:
 * a second star from the same user is not an error, so the optimistic UI can
 * retry a dropped request without a 409.
 */
export async function setBoardStar(
  db: DbExecutor,
  boardId: string,
  userId: string,
  starred: boolean,
): Promise<void> {
  if (starred) {
    await db.insert(boardStarTable).values({ boardId, userId }).onConflictDoNothing();
    return;
  }

  await db
    .delete(boardStarTable)
    .where(and(eq(boardStarTable.boardId, boardId), eq(boardStarTable.userId, userId)));
}
