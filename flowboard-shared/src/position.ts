import { POSITION_MIN_GAP, POSITION_STEP } from './constants.js';

/**
 * Sparse-float ordering (FS §5.1, STANDARDS §1.3).
 *
 * Moving a card writes one row instead of renumbering a list: the new position
 * is the midpoint of its neighbours. Repeated midpoints shrink the gap, so
 * `needsRebalance` detects when a list has to be rewritten with `rebalance`.
 *
 * Every function here is pure. The API and the web app both import this module
 * so a drag computes the same number on either side.
 *
 * Precision note: `POSITION_MIN_GAP` is an absolute threshold, so it only
 * discriminates while positions stay below roughly 1e9, where one ULP of a
 * `double precision` value (~1.2e-7) is still smaller than the threshold.
 * Appends move by `POSITION_STEP`, so reaching 1e9 takes about a million
 * appends to a single container. Above that range `positionBetween` still
 * refuses to return a colliding position — it throws and the caller
 * re-balances — so the ordering invariant holds either way.
 */

/** Thrown when a caller passes a position that cannot produce a valid result. */
export class PositionError extends Error {
  public override readonly name = 'PositionError';
}

function assertPosition(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new PositionError(`${label} must be a finite number`);
  }
}

/**
 * Position for an item appended after `last`, or the first position when the
 * container is empty (`last` is `null` or `undefined`).
 */
export function positionAtEnd(last?: number | null): number {
  if (last === null || last === undefined) {
    return POSITION_STEP;
  }

  assertPosition(last, 'last');

  return last + POSITION_STEP;
}

/**
 * Position for an item dropped between `before` and `after`. A `null` or
 * `undefined` neighbour means the item goes at that edge of the container.
 *
 * Throws when the neighbours are not strictly ascending, or when the gap
 * between them is already too small to split — the caller must re-balance
 * (`needsRebalance`) and retry rather than silently collide.
 */
export function positionBetween(before?: number | null, after?: number | null): number {
  if (before !== null && before !== undefined) assertPosition(before, 'before');
  if (after !== null && after !== undefined) assertPosition(after, 'after');

  if (after === null || after === undefined) {
    // Nothing follows: append (an empty container yields POSITION_STEP).
    return positionAtEnd(before);
  }

  if (before === null || before === undefined) {
    // Dropped at the head: halve the first position so the result stays > 0.
    return after / 2;
  }

  if (before >= after) {
    throw new PositionError(`before (${before}) must be strictly less than after (${after})`);
  }

  const midpoint = before + (after - before) / 2;

  if (midpoint <= before || midpoint >= after) {
    throw new PositionError(
      `no representable position between ${before} and ${after}; re-balance the container first`,
    );
  }

  return midpoint;
}

/**
 * True when any neighbouring gap in `positions` (ascending container order) is
 * below `POSITION_MIN_GAP`, i.e. the container should be re-balanced.
 *
 * Fewer than two positions can never need a re-balance.
 */
export function needsRebalance(positions: readonly number[]): boolean {
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];

    if (previous === undefined || current === undefined) continue;

    if (current - previous < POSITION_MIN_GAP) {
      return true;
    }
  }

  return false;
}

/**
 * Evenly spaced positions for a container of `count` items:
 * `1024, 2048, 3072, …`. The caller writes them back in the container's
 * current order, so relative order is preserved.
 */
export function rebalance(count: number): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new PositionError(`count must be a non-negative integer, received ${count}`);
  }

  return Array.from({ length: count }, (_unused, index) => (index + 1) * POSITION_STEP);
}
