/**
 * Sort a list's cards by due date (L-05, CL-A14).
 *
 * One module, imported by the API route that rewrites positions and by the web
 * app that reorders optimistically, so the order the user sees before the
 * response arrives is the order the server commits.
 *
 * The sort is **stable**: cards sharing a due date keep their current relative
 * order, which is what FB-05 AC 5 asserts when B stays before E. Stability
 * comes from `Array#sort`, which ECMAScript has required to be stable since
 * ES2019 — the comparator returns `0` for a tie rather than falling back to a
 * tiebreaker, so the caller's input order is the tiebreak.
 */

/** The fields the comparator needs. Both `CardSummary` and a card row fit. */
export interface SortableByDue {
  readonly id: string;
  /** `null` when the card has no due date; those sort last (L-05). */
  readonly dueAt: Date | string | null;
}

/** Milliseconds since the epoch, or `null` for a card with no due date. */
function dueTime(card: SortableByDue): number | null {
  if (card.dueAt === null) return null;

  const time = card.dueAt instanceof Date ? card.dueAt.getTime() : Date.parse(card.dueAt);

  // An unparseable timestamp sorts with the undated cards rather than throwing:
  // a bad row must not make the whole list unsortable.
  return Number.isNaN(time) ? null : time;
}

/**
 * Ascending by due date, undated last (L-05). Returns `0` for two cards with
 * the same due date and for two undated cards, which is what keeps the sort
 * stable.
 */
export function compareByDue(a: SortableByDue, b: SortableByDue): number {
  const left = dueTime(a);
  const right = dueTime(b);

  if (left === null && right === null) return 0;
  // Undated cards go after every dated one, regardless of direction.
  if (left === null) return 1;
  if (right === null) return -1;

  return left - right;
}

/**
 * `cards` reordered by due date. The input must already be in the list's
 * current rank order (position, then id) — that order is the tiebreak.
 *
 * The input array is not mutated.
 */
export function sortByDue<T extends SortableByDue>(cards: readonly T[]): T[] {
  return [...cards].sort(compareByDue);
}

export interface SortByDueResult<T extends SortableByDue> {
  /** Every card, in the new order. */
  readonly ordered: readonly T[];
  /**
   * The ids of the cards whose **rank** changed, in their new order (CL-A14).
   *
   * Rank, not position: a sort rewrites every position, but a card that was
   * already first and stays first has not moved as far as the user or the
   * activity feed is concerned, so it gets no `card.moved` event (AC 5).
   */
  readonly movedCardIds: readonly string[];
}

/**
 * The sorted order plus the cards that actually changed rank, which is exactly
 * what the route needs: the order to write and the events to append.
 */
export function sortByDueWithMoves<T extends SortableByDue>(
  cards: readonly T[],
): SortByDueResult<T> {
  const ordered = sortByDue(cards);
  const rankBefore = new Map(cards.map((card, index) => [card.id, index]));

  const movedCardIds = ordered
    .filter((card, index) => rankBefore.get(card.id) !== index)
    .map((card) => card.id);

  return { ordered, movedCardIds };
}
