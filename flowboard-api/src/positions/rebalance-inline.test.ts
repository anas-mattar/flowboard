import {
  POSITION_MIN_GAP,
  POSITION_STEP,
  needsRebalance,
  positionBetween,
} from '@flowboard/shared';
import { describe, expect, it } from 'vitest';
import { planInlineRebalance, rankOrder, type PositionedItem } from './rebalance-inline.js';

/** FB-07 §10: the pure part of CL-E36 — container ordering and the threshold. */

describe('rankOrder', () => {
  it('orders by ascending position', () => {
    const items = [
      { id: 'c', position: 3072 },
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
    ];

    expect(rankOrder(items).map((item) => item.id)).toStrictEqual(['a', 'b', 'c']);
  });

  it('breaks a position tie by ascending id (CL-E41)', () => {
    const items = [
      { id: 'b', position: 1024 },
      { id: 'a', position: 1024 },
    ];

    expect(rankOrder(items).map((item) => item.id)).toStrictEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const items = [
      { id: 'b', position: 2048 },
      { id: 'a', position: 1024 },
    ];

    rankOrder(items);

    expect(items.map((item) => item.id)).toStrictEqual(['b', 'a']);
  });
});

describe('planInlineRebalance threshold', () => {
  it('returns null while every gap is at or above POSITION_MIN_GAP', () => {
    const items = [
      { id: 'a', position: 1024 },
      { id: 'b', position: 1024 + POSITION_MIN_GAP },
      { id: 'c', position: 2048 },
    ];

    expect(planInlineRebalance(items)).toBeNull();
  });

  it('plans a rewrite as soon as one gap falls below POSITION_MIN_GAP', () => {
    const items = [
      { id: 'a', position: 1024 },
      { id: 'b', position: 1024 + POSITION_MIN_GAP / 2 },
      { id: 'c', position: 2048 },
    ];

    expect(planInlineRebalance(items)).toStrictEqual([
      { id: 'a', position: POSITION_STEP },
      { id: 'b', position: 2 * POSITION_STEP },
      { id: 'c', position: 3 * POSITION_STEP },
    ]);
  });

  it('returns null for an empty or single-item container', () => {
    expect(planInlineRebalance([])).toBeNull();
    expect(planInlineRebalance([{ id: 'a', position: 0.5 }])).toBeNull();
  });
});

describe('planInlineRebalance rewrite', () => {
  it('keeps relative order and leaves needsRebalance false', () => {
    const items = [
      { id: 'c', position: 2048 },
      { id: 'a', position: 1024 },
      { id: 'b', position: 1024 + POSITION_MIN_GAP / 4 },
    ];

    const plan = planInlineRebalance(items);

    expect(plan).not.toBeNull();
    expect(plan?.map((item) => item.id)).toStrictEqual(['a', 'b', 'c']);
    expect(needsRebalance(plan?.map((item) => item.position) ?? [])).toBe(false);
  });

  it('spaces the rewrite evenly by POSITION_STEP', () => {
    const items: PositionedItem[] = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1 + POSITION_MIN_GAP / 2 },
      { id: 'c', position: 2 },
      { id: 'd', position: 3 },
    ];

    expect(planInlineRebalance(items)?.map((item) => item.position)).toStrictEqual([
      1024, 2048, 3072, 4096,
    ]);
  });

  it('keeps 60 midpoint drops between the same neighbours ordered and re-balanced', () => {
    // The AC 8 shape without a database: `moved` is dropped into the shrinking
    // gap just above `left` 60 times. The container is replaced on every
    // iteration rather than mutated, which is how the repositories apply a
    // plan (one UPDATE per row, then a fresh read).
    let container: PositionedItem[] = [
      { id: 'left', position: 1024 },
      { id: 'moved', position: positionBetween(1024, 2048) },
      { id: 'right', position: 2048 },
    ];
    let plans = 0;

    const positionOf = (items: readonly PositionedItem[], id: string): number => {
      const found = items.find((item) => item.id === id);
      if (found === undefined) throw new Error(`${id} disappeared from the container`);

      return found.position;
    };

    for (let drop = 0; drop < 60; drop += 1) {
      const dropped = positionBetween(
        positionOf(container, 'left'),
        positionOf(container, 'moved'),
      );

      container = rankOrder(
        container.map((item) => (item.id === 'moved' ? { id: item.id, position: dropped } : item)),
      );

      const plan = planInlineRebalance(container);

      if (plan !== null) {
        plans += 1;
        container = plan;

        // A re-balance leaves the container evenly spaced (AC 8).
        expect(container.map((item) => item.position)).toStrictEqual([1024, 2048, 3072]);
      }

      // Whatever happened, no gap is below the threshold once the drop settles.
      expect(needsRebalance(container.map((item) => item.position))).toBe(false);
    }

    // 1024 halves below POSITION_MIN_GAP in ~30 steps, so 60 drops re-balance
    // at least once, and relative order survives every rewrite.
    expect(plans).toBeGreaterThan(0);
    expect(container.map((item) => item.id)).toStrictEqual(['left', 'moved', 'right']);
  });
});
