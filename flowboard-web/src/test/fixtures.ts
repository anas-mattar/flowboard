import type {
  AuthResponse,
  Board,
  BoardHydrated,
  BoardSummary,
  CardSummary,
  ListWithCards,
  MeResponse,
  User,
  Workspace,
} from '@flowboard/shared';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '018f0a3a-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    initials: 'AL',
    avatarColor: '#3d6df0',
    theme: 'system',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: '018f0a3a-0000-7000-8000-000000000002',
    name: "Ada Lovelace's workspace",
    plan: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeAuthResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    user: makeUser(),
    workspace: makeWorkspace(),
    ...overrides,
  };
}

export function makeMeResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  const workspace = makeWorkspace();
  return {
    user: makeUser(),
    workspaces: [{ workspace, role: 'admin' }],
    currentWorkspace: workspace,
    ...overrides,
  };
}

let boardSequence = 0;

export function makeBoardSummary(overrides: Partial<BoardSummary> = {}): BoardSummary {
  boardSequence += 1;
  return {
    id: `018f0a3a-0000-7000-8000-${String(boardSequence).padStart(12, '0')}`,
    workspaceId: '018f0a3a-0000-7000-8000-000000000002',
    name: `Board ${String(boardSequence)}`,
    color: '#3d6df0',
    starred: false,
    cardCount: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeBoard(overrides: Partial<Board> = {}): Board {
  const summary = makeBoardSummary();
  return {
    id: summary.id,
    workspaceId: summary.workspaceId,
    name: summary.name,
    color: summary.color,
    archivedAt: summary.archivedAt,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    ...overrides,
  };
}

export function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: '018f0a3a-0000-7000-8000-000000002001',
    listId: '018f0a3a-0000-7000-8000-000000001001',
    title: 'Card',
    position: 1024,
    dueAt: null,
    dueComplete: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    labelIds: [],
    memberIds: [],
    checklist: { done: 0, total: 0 },
    commentCount: 0,
    hasDescription: false,
    ...overrides,
  };
}

export function makeList(overrides: Partial<ListWithCards> = {}): ListWithCards {
  return {
    id: '018f0a3a-0000-7000-8000-000000001001',
    boardId: '018f0a3a-0000-7000-8000-000000001000',
    name: 'To Do',
    position: 1024,
    wipLimit: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    cards: [],
    ...overrides,
  };
}

export function makeBoardHydrated(overrides: Partial<BoardHydrated> = {}): BoardHydrated {
  const board = makeBoard();
  return {
    board,
    members: [],
    labels: [],
    lists: [
      makeList({ id: `${board.id}-list-todo`, boardId: board.id, name: 'To Do', position: 1024 }),
      makeList({
        id: `${board.id}-list-doing`,
        boardId: board.id,
        name: 'Doing',
        position: 2048,
        wipLimit: 3,
      }),
      makeList({ id: `${board.id}-list-done`, boardId: board.id, name: 'Done', position: 3072 }),
    ],
    starred: false,
    callerRole: 'admin',
    ...overrides,
  };
}
