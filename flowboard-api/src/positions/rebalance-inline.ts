import { needsRebalance, rebalance } from '@flowboard/shared';

/**
 * The pure half of the inline re-balance (CL-E36, FB-07 §6).
 *
 * A move writes the position the client computed (CL-E41). Repeated midpoint
 * drops between the same two neighbours halve the gap each time, so after
 * roughly fifty drops the gap falls under `POSITION_MIN_GAP` and the container
 * has to be rewritten. FS §5.1 assigns that to a background job; MVP-2 has no
 * job runner (ADR-001), so it runs in the move transaction instead.
 *
 * Everything here is pure so the ordering and the threshold are tested without
 * a database (`rebalance-inline.test.ts`, FB-07 §10). The locking and the
 * writes live in the card and list repositories.
 */

/** An item of an ordered container: a card in a list, or a list on a board. */
export interface PositionedItem {
  readonly id: string;
  readonly position: number;
}

/**
 * Container order (CL-E41): ascending `position`, ties broken by ascending
 * `id`. Two items can only share a position through a lost race, and breaking
 * the tie by id makes the rewrite deterministic rather than dependent on the
 * order the rows came back in.
 */
export function rankOrder<T extends PositionedItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    left.position === right.position
      ? left.id.localeCompare(right.id)
      : left.position - right.position,
  );
}

/**
 * The rewrite the container needs, or `null` when no gap is too small and
 * nothing should be written.
 *
 * The result is in rank order and carries `rebalance(count)` positions, so
 * applying it preserves relative order and leaves `needsRebalance` false.
 */
export function planInlineRebalance<T extends PositionedItem>(
  items: readonly T[],
): PositionedItem[] | null {
  const ordered = rankOrder(items);

  if (!needsRebalance(ordered.map((item) => item.position))) return null;

  const positions = rebalance(ordered.length);

  return ordered.map((item, index) => {
    const position = positions[index];

    // Unreachable: `rebalance` returns exactly `count` positions. Narrowed
    // rather than asserted so `noUncheckedIndexedAccess` stays on.
    if (position === undefined) {
      throw new Error('planInlineRebalance: rebalance returned too few positions');
    }

    return { id: item.id, position };
  });
}
