import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { POSITION_MIN_GAP, POSITION_STEP } from './constants.js';
import {
  PositionError,
  needsRebalance,
  positionAtEnd,
  positionBetween,
  rebalance,
} from './position.js';

/**
 * Positions a real container can hold. The upper bound is 1e9: appends move by
 * POSITION_STEP, so a list would need ~10^6 appends to get there, and one ULP
 * at 1e9 (~1.2e-7) is still below POSITION_MIN_GAP. Above that the absolute
 * 1e-6 threshold stops being meaningful — see the note in `position.ts`.
 */
const position = fc.double({
  min: 1e-3,
  max: 1e9,
  noNaN: true,
  noDefaultInfinity: true,
});

describe('positionAtEnd (FB-01 §4.3)', () => {
  it('returns POSITION_STEP for an empty container', () => {
    expect(positionAtEnd(null)).toBe(POSITION_STEP);
    expect(positionAtEnd(undefined)).toBe(POSITION_STEP);
    expect(positionAtEnd()).toBe(1024);
  });

  it('returns last + 1024', () => {
    expect(positionAtEnd(1024)).toBe(2048);
    expect(positionAtEnd(1536.5)).toBe(2560.5);
  });

  it('always sorts after the previous last position', () => {
    fc.assert(
      fc.property(position, (last) => {
        expect(positionAtEnd(last)).toBeGreaterThan(last);
      }),
    );
  });

  it('rejects a non-finite last position', () => {
    expect(() => positionAtEnd(Number.NaN)).toThrow(PositionError);
    expect(() => positionAtEnd(Number.POSITIVE_INFINITY)).toThrow(PositionError);
  });
});

describe('positionBetween (FB-01 §4.3)', () => {
  it('returns the midpoint of two neighbours', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(0.5, 1.5)).toBe(1);
  });

  it('treats a missing neighbour as a container edge', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(null, 1024)).toBe(512);
    expect(positionBetween(1024, null)).toBe(2048);
  });

  it('keeps the head position strictly positive', () => {
    fc.assert(
      fc.property(position, (first) => {
        const head = positionBetween(null, first);
        expect(head).toBeGreaterThan(0);
        expect(head).toBeLessThan(first);
      }),
    );
  });

  it('property: the result lies strictly between ordered neighbours', () => {
    fc.assert(
      fc.property(position, position, (a, b) => {
        fc.pre(a !== b);
        const before = Math.min(a, b);
        const after = Math.max(a, b);
        // Skip pairs already too close to split; those are a re-balance case.
        fc.pre(after - before > POSITION_MIN_GAP);

        const middle = positionBetween(before, after);

        expect(middle).toBeGreaterThan(before);
        expect(middle).toBeLessThan(after);
      }),
    );
  });

  it('property: repeated inserts preserve relative order', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }), (goLeft) => {
        let positions = rebalance(2);

        for (const left of goLeft) {
          const [first, second] = positions as [number, number, ...number[]];
          const target = left ? positionBetween(null, first) : positionBetween(first, second);
          positions = [...positions, target].sort((x, y) => x - y);

          if (needsRebalance(positions)) {
            positions = rebalance(positions.length);
          }
        }

        const sorted = [...positions].sort((x, y) => x - y);
        expect(positions).toStrictEqual(sorted);
        expect(new Set(positions).size).toBe(positions.length);
      }),
    );
  });

  it('rejects neighbours that are not strictly ascending', () => {
    expect(() => positionBetween(2048, 1024)).toThrow(PositionError);
    expect(() => positionBetween(1024, 1024)).toThrow(PositionError);
  });

  it('rejects a gap with no representable midpoint', () => {
    // 2**-42 is one ULP at 1024, so these two doubles are adjacent and the
    // midpoint rounds back onto a neighbour. The caller must re-balance.
    const before = 1024;
    const after = 1024 + 2 ** -42;

    expect(after).toBeGreaterThan(before);
    expect(() => positionBetween(before, after)).toThrow(PositionError);
  });
});

describe('needsRebalance (FB-01 §4.3)', () => {
  it('is false for an empty or single-item container', () => {
    expect(needsRebalance([])).toBe(false);
    expect(needsRebalance([1024])).toBe(false);
  });

  it('is false for comfortably spaced positions', () => {
    expect(needsRebalance([1024, 2048, 3072])).toBe(false);
  });

  it('is true when any neighbouring gap is below POSITION_MIN_GAP', () => {
    expect(needsRebalance([1024, 1024 + POSITION_MIN_GAP / 2, 3072])).toBe(true);
    expect(needsRebalance([1024, 2048, 2048 + 1e-9])).toBe(true);
  });

  it('is false for a gap comfortably above POSITION_MIN_GAP', () => {
    // `1 + 1e-6` does not round to a gap of exactly 1e-6, so the boundary is
    // probed from just above it rather than asserted on the exact value.
    expect(needsRebalance([1, 1 + POSITION_MIN_GAP * 10])).toBe(false);
    expect(needsRebalance([1024, 1024 + POSITION_MIN_GAP * 10])).toBe(false);
  });

  it('property: a re-balanced container never needs re-balancing', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (count) => {
        expect(needsRebalance(rebalance(count))).toBe(false);
      }),
    );
  });
});

describe('rebalance (FB-01 §4.3)', () => {
  it('returns 1024, 2048, 3072, …', () => {
    expect(rebalance(0)).toStrictEqual([]);
    expect(rebalance(1)).toStrictEqual([1024]);
    expect(rebalance(3)).toStrictEqual([1024, 2048, 3072]);
  });

  it('property: output is strictly ascending with length count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (count) => {
        const positions = rebalance(count);
        expect(positions).toHaveLength(count);
        for (let index = 1; index < positions.length; index += 1) {
          expect(positions[index]!).toBeGreaterThan(positions[index - 1]!);
        }
      }),
    );
  });

  it('rejects a negative or fractional count', () => {
    expect(() => rebalance(-1)).toThrow(PositionError);
    expect(() => rebalance(1.5)).toThrow(PositionError);
  });
});
