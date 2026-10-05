/**
 * One-shot, same-tab signal that a just-created board's title input should
 * receive focus on mount (FB-04 spec §5 "Focus behaviour"). An in-memory set
 * is enough: creation always navigates in the same tab, so there is no need
 * for `sessionStorage` or router state plumbing.
 */
const pendingFocusBoardIds = new Set<string>();

export function markBoardTitleForFocus(boardId: string): void {
  pendingFocusBoardIds.add(boardId);
}

/** Returns true at most once per board id: the caller consumes the signal. */
export function consumeBoardTitleFocus(boardId: string): boolean {
  if (pendingFocusBoardIds.has(boardId)) {
    pendingFocusBoardIds.delete(boardId);
    return true;
  }
  return false;
}
