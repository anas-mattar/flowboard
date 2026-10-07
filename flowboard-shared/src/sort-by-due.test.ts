import { describe, expect, it } from 'vitest';
import { compareByDue, sortByDue, sortByDueWithMoves } from './sort-by-due.js';

/** FB-05 §10: stable ascending, nulls last, rank-change detection. */

/** The AC 5 fixture, in rank order 1 to 5. */
const AC5 = [
  { id: 'A', dueAt: '2026-10-10T09:00:00.000Z' },
  { id: 'B', dueAt: '2026-10-12T09:00:00.000Z' },
  { id: 'C', dueAt: '2026-10-11T09:00:00.000Z' },
  { id: 'D', dueAt: null },
  { id: 'E', dueAt: '2026-10-12T09:00:00.000Z' },
] as const;

describe('compareByDue (L-05)', () => {
  it('orders an earlier due date first', () => {
    expect(
      compareByDue({ id: 'a', dueAt: '2026-10-10' }, { id: 'b', dueAt: '2026-10-11' }),
    ).toBeLessThan(0);
  });

  it('puts an undated card after a dated one, in both directions', () => {
    const dated = { id: 'a', dueAt: '2026-10-10' };
    const undated = { id: 'b', dueAt: null };

    expect(compareByDue(dated, undated)).toBeLessThan(0);
    expect(compareByDue(undated, dated)).toBeGreaterThan(0);
  });

  it('returns 0 for equal due dates, so the caller order is the tiebreak', () => {
    expect(compareByDue({ id: 'a', dueAt: '2026-10-10' }, { id: 'b', dueAt: '2026-10-10' })).toBe(
      0,
    );
    expect(compareByDue({ id: 'a', dueAt: null }, { id: 'b', dueAt: null })).toBe(0);
  });

  it('treats a Date and its ISO string as the same instant', () => {
    const iso = '2026-10-10T09:00:00.000Z';

    expect(compareByDue({ id: 'a', dueAt: new Date(iso) }, { id: 'b', dueAt: iso })).toBe(0);
  });

  it('sorts an unparseable due date with the undated cards rather than throwing', () => {
    const broken = { id: 'a', dueAt: 'not-a-date' };

    expect(compareByDue(broken, { id: 'b', dueAt: '2026-10-10' })).toBeGreaterThan(0);
  });
});

describe('sortByDue (AC 5)', () => {
  it('orders the AC 5 fixture A, C, B, E, D', () => {
    expect(sortByDue(AC5).map((card) => card.id)).toStrictEqual(['A', 'C', 'B', 'E', 'D']);
  });

  it('keeps B before E because the sort is stable', () => {
    const ids = sortByDue(AC5).map((card) => card.id);

    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('E'));
  });

  it('does not mutate its input', () => {
    const input = [...AC5];

    sortByDue(input);

    expect(input.map((card) => card.id)).toStrictEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('handles an empty list and a single card', () => {
    expect(sortByDue([])).toStrictEqual([]);
    expect(sortByDue([AC5[0]]).map((card) => card.id)).toStrictEqual(['A']);
  });
});

describe('sortByDueWithMoves (CL-A14)', () => {
  it('reports exactly the cards whose rank changed, in their new order', () => {
    const { ordered, movedCardIds } = sortByDueWithMoves(AC5);

    expect(ordered.map((card) => card.id)).toStrictEqual(['A', 'C', 'B', 'E', 'D']);
    // A keeps rank 1, so it is absent even though its position is rewritten.
    expect(movedCardIds).toStrictEqual(['C', 'B', 'E', 'D']);
  });

  it('reports nothing on an already sorted list, so a second call is a no-op', () => {
    const { ordered } = sortByDueWithMoves(AC5);

    expect(sortByDueWithMoves(ordered).movedCardIds).toStrictEqual([]);
  });

  it('reports nothing when every card shares a due date', () => {
    const same = [
      { id: 'a', dueAt: '2026-10-10' },
      { id: 'b', dueAt: '2026-10-10' },
      { id: 'c', dueAt: '2026-10-10' },
    ];

    expect(sortByDueWithMoves(same).movedCardIds).toStrictEqual([]);
  });

  it('reports nothing when no card has a due date', () => {
    const undated = [
      { id: 'a', dueAt: null },
      { id: 'b', dueAt: null },
    ];

    expect(sortByDueWithMoves(undated).movedCardIds).toStrictEqual([]);
  });
});
