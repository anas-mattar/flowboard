import type { BoardRole, WorkspaceRole } from '@flowboard/shared';

/**
 * The single authorisation module (STANDARDS §1.4, FS §6).
 *
 * Route handlers call `can()`; they never embed a role check inline. FB-02
 * implements the workspace-level rows and fixes the shape of the board rows
 * so FB-04 only has to fill them in — the matrix is already complete, which
 * is what lets `authz/can.test.ts` and `test/auth.matrix.test.ts` be written
 * once (FB-02 §8).
 */

/**
 * Every capability in the FS §6 matrix, plus the self-service capabilities
 * FB-02 introduces. Named `<subject>.<verb>` so a route reads as the thing it
 * is doing.
 */
export const CAPABILITIES = [
  // Self-service: available to any authenticated user (FB-02 §8).
  'self.read',
  'self.updateTheme',
  'self.logout',

  // Workspace-level (FS §6 last row, CL-A9).
  'workspace.read',
  'workspace.manageMembers',
  'workspace.manageBilling',

  // Board-level (FS §6). Resolved in FB-04; see `boardCapability` below.
  'board.view',
  'board.comment',
  'board.manageCards',
  'board.manageLists',
  'board.manageLabels',
  'board.manageMembers',
  'board.manage',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** The caller as the authorisation module sees them. */
export interface Principal {
  readonly userId: string;
}

/**
 * What the caller is acting on. `workspaceRole` is the caller's role in the
 * workspace that owns the resource; `boardRole` is their role on the board.
 *
 * Both are optional because a principal may be in neither: a user who is not
 * a member of a workspace has no workspace role there, and every capability
 * that needs one is then denied.
 */
export interface ResourceContext {
  readonly workspaceRole?: WorkspaceRole | undefined;
  readonly boardRole?: BoardRole | undefined;
}

/** Board capabilities each board role carries (FS §6 columns 2 to 4). */
const BOARD_ROLE_CAPABILITIES: Readonly<Record<BoardRole, readonly Capability[]>> = {
  admin: [
    'board.view',
    'board.comment',
    'board.manageCards',
    'board.manageLists',
    'board.manageLabels',
    'board.manageMembers',
    'board.manage',
  ],
  member: ['board.view', 'board.comment', 'board.manageCards', 'board.manageLists', 'board.manageLabels'],
  // Observer is read-and-comment only (FS §6 note).
  observer: ['board.view', 'board.comment'],
};

/**
 * A workspace admin has every board capability inside their workspace
 * (FS §6 column 1), so they are never locked out of a board in the workspace
 * they administer.
 */
const WORKSPACE_ADMIN_BOARD_CAPABILITIES = BOARD_ROLE_CAPABILITIES.admin;

/** Workspace capabilities each workspace role carries (FS §6 last row, CL-A9). */
const WORKSPACE_ROLE_CAPABILITIES: Readonly<Record<WorkspaceRole, readonly Capability[]>> = {
  admin: ['workspace.read', 'workspace.manageMembers', 'workspace.manageBilling'],
  member: ['workspace.read'],
};

/** Capabilities any authenticated user has about themselves (FB-02 §8). */
const SELF_CAPABILITIES: readonly Capability[] = ['self.read', 'self.updateTheme', 'self.logout'];

/**
 * Whether `principal` may exercise `capability` in `context`.
 *
 * Unauthenticated callers never reach here: `requireAuth` rejects them with
 * `401` first, which is why there is no "anonymous" principal.
 */
export function can(
  principal: Principal,
  capability: Capability,
  context: ResourceContext = {},
): boolean {
  if (principal.userId.length === 0) return false;

  if (SELF_CAPABILITIES.includes(capability)) return true;

  const { workspaceRole, boardRole } = context;

  if (capability.startsWith('workspace.')) {
    if (workspaceRole === undefined) return false;

    return WORKSPACE_ROLE_CAPABILITIES[workspaceRole].includes(capability);
  }

  if (capability.startsWith('board.')) {
    if (workspaceRole === 'admin' && WORKSPACE_ADMIN_BOARD_CAPABILITIES.includes(capability)) {
      return true;
    }

    if (boardRole === undefined) return false;

    return BOARD_ROLE_CAPABILITIES[boardRole].includes(capability);
  }

  // Unreachable while `Capability` is exhaustive; deny rather than throw so a
  // future capability added without a rule fails closed.
  return false;
}
