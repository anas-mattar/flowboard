import { describe, expect, it } from 'vitest';
import {
  InvalidCursorError,
  compareBoardOrder,
  decodeBoardCursor,
  encodeBoardCursor,
  starredRank,
  type BoardCursor,
} from './ordering.js';

/** FB-04 §10 unit row: starred then name, cursor encoding. */

const cursor = (overrides: Partial<BoardCursor> = {}): BoardCursor => ({
  starred: false,
  lowerName: 'launch',
  id: '00000000-0000-7000-8000-000000000001',
  ...overrides,
});

describe('compareBoardOrder (AC 2, CL-E17)', () => {
  it('puts a starred board before an unstarred one regardless of name', () => {
    const starred = cursor({ starred: true, lowerName: 'zebra' });
    const plain = cursor({ starred: false, lowerName: 'apple' });

    expect(compareBoardOrder(starred, plain)).toBeLessThan(0);
  });

  it('orders by name within the same star group', () => {
    const apple = cursor({ lowerName: 'apple' });
    const banana = cursor({ lowerName: 'banana' });

    expect(compareBoardOrder(apple, banana)).toBeLessThan(0);
    expect(compareBoardOrder(banana, apple)).toBeGreaterThan(0);
  });

  it('is case-insensitive, because the key is already lower-cased', () => {
    const upper = cursor({ lowerName: 'Apple'.toLowerCase() });
    const lower = cursor({ lowerName: 'apple' });

    expect(compareBoardOrder(upper, lower)).toBe(0);
  });

  it('breaks a name tie on id so the order is total', () => {
    const first = cursor({ id: '00000000-0000-7000-8000-00000000000a' });
    const second = cursor({ id: '00000000-0000-7000-8000-00000000000b' });

    expect(compareBoardOrder(first, second)).toBeLessThan(0);
    expect(compareBoardOrder(first, first)).toBe(0);
  });

  it('sorts a mixed set the way the sidebar renders it', () => {
    const rows = [
      cursor({ lowerName: 'marketing launch', id: 'b' }),
      cursor({ starred: true, lowerName: 'product roadmap q3', id: 'a' }),
      cursor({ lowerName: 'customer support', id: 'c' }),
      cursor({ starred: true, lowerName: 'admin', id: 'd' }),
    ];

    expect([...rows].sort(compareBoardOrder).map((row) => row.lowerName)).toEqual([
      'admin',
      'product roadmap q3',
      'customer support',
      'marketing launch',
    ]);
  });
});

describe('starredRank', () => {
  it('ranks starred ahead of unstarred, ascending', () => {
    expect(starredRank(true)).toBeLessThan(starredRank(false));
  });
});

describe('board cursor encoding (AC 3)', () => {
  it('round-trips every field', () => {
    const original = cursor({ starred: true, lowerName: "o'brien & sons" });

    expect(decodeBoardCursor(encodeBoardCursor(original))).toEqual(original);
  });

  it('round-trips a name with characters that are not base64-safe', () => {
    const original = cursor({ lowerName: 'ünïcode / böard +?' });

    expect(decodeBoardCursor(encodeBoardCursor(original))).toEqual(original);
  });

  it('produces a url-safe token with no padding', () => {
    const encoded = encodeBoardCursor(cursor({ lowerName: 'a'.repeat(40) }));

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64 at all', '!!!!'],
    ['base64 that is not json', Buffer.from('nonsense', 'utf8').toString('base64url')],
    ['json that is not an array', Buffer.from('{"a":1}', 'utf8').toString('base64url')],
    ['an array of the wrong length', Buffer.from('[0,"a"]', 'utf8').toString('base64url')],
    ['a rank outside 0 and 1', Buffer.from('[2,"a","b"]', 'utf8').toString('base64url')],
    ['a non-string name', Buffer.from('[0,5,"b"]', 'utf8').toString('base64url')],
  ])('rejects %s with InvalidCursorError', (_case, encoded) => {
    expect(() => decodeBoardCursor(encoded)).toThrow(InvalidCursorError);
  });
});
