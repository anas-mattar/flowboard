import {
  userThemeSchema,
  workspacePlanSchema,
  type Board,
  type BoardCallerRole,
  type BoardHydrated,
  type BoardSummary,
  type CardSummary,
  type Label,
  type List,
  type ListWithCards,
  type User,
  type Workspace,
} from '@flowboard/shared';
import type { BoardRow, LabelRow, ListRow, UserRow, WorkspaceRow } from '../db/schema/index.js';
import type { BoardHydration, HydratedCard } from '../repositories/board.js';

/**
 * Row-to-response mapping (FB-01 §6: snake_case columns, camelCase JSON,
 * timestamps as UTC ISO 8601 strings).
 *
 * Every field is named explicitly rather than spread, so a column added later
 * — `password_hash` being the one that matters — cannot leak into a response
 * by accident (FS §8).
 *
 * `theme` and `plan` are `text` columns guarded by CHECK constraints, so they
 * are parsed rather than cast: an unexpected value fails here instead of
 * reaching the client.
 */

export function presentUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    initials: row.initials,
    avatarColor: row.avatarColor,
    theme: userThemeSchema.parse(row.theme),
    createdAt: row.createdAt.toISOString(),
  };
}

export function presentWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    plan: workspacePlanSchema.parse(row.plan),
    createdAt: row.createdAt.toISOString(),
  };
}

export function presentBoard(row: BoardRow): Board {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A sidebar row (B-01). `starred` is the caller's own star (CL-E14) and
 * `cardCount` is the CL-E17 count, both computed per request rather than
 * stored, so neither can go stale.
 */
export function presentBoardSummary(
  row: BoardRow,
  starred: boolean,
  cardCount: number,
): BoardSummary {
  return { ...presentBoard(row), starred, cardCount };
}

export function presentLabel(row: LabelRow): Label {
  return { id: row.id, boardId: row.boardId, name: row.name, color: row.color };
}

export function presentList(row: ListRow): List {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    position: row.position,
    wipLimit: row.wipLimit,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function presentCardSummary(card: HydratedCard): CardSummary {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    position: card.position,
    dueAt: card.dueAt === null ? null : card.dueAt.toISOString(),
    dueComplete: card.dueComplete,
    labelIds: [...card.labelIds],
    memberIds: [...card.memberIds],
    checklist: { done: card.checklist.done, total: card.checklist.total },
    commentCount: card.commentCount,
    hasDescription: card.hasDescription,
    updatedAt: card.updatedAt.toISOString(),
  };
}

/** The single hydration response of FS §7 (FB-04 §6). */
export function presentHydratedBoard(
  row: BoardRow,
  hydration: BoardHydration,
  caller: { readonly starred: boolean; readonly callerRole: BoardCallerRole },
): BoardHydrated {
  const lists: ListWithCards[] = hydration.lists.map((entry) => ({
    ...presentList(entry.list),
    cards: entry.cards.map(presentCardSummary),
  }));

  return {
    board: presentBoard(row),
    members: hydration.members.map((member) => ({
      user: {
        id: member.user.id,
        displayName: member.user.displayName,
        initials: member.user.initials,
        avatarColor: member.user.avatarColor,
      },
      role: member.role,
    })),
    labels: hydration.labels.map(presentLabel),
    lists,
    starred: caller.starred,
    callerRole: caller.callerRole,
  };
}
