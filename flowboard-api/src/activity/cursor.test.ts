import { describe, expect, it } from 'vitest';
import {
  InvalidActivityCursorError,
  compareActivityOrder,
  decodeActivityCursor,
  encodeActivityCursor,
  type ActivityCursor,
} from './cursor.js';

/** FB-06 §10 unit row: the activity cursor (AC 8, CL-E38). */

const EARLIER: ActivityCursor = {
  createdAt: '2026-10-09T10:00:00.000Z',
  id: '3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f',
};

const SAME_INSTANT: ActivityCursor = {
  createdAt: EARLIER.createdAt,
  id: '7c2b8d1e-4f3a-4b5c-9d8e-2a1b3c4d5e6f',
};

const LATER: ActivityCursor = {
  createdAt: '2026-10-09T11:00:00.000Z',
  id: EARLIER.id,
};

describe('encode and decode', () => {
  it('round-trips both ordering fields', () => {
    expect(decodeActivityCursor(encodeActivityCursor(EARLIER))).toStrictEqual(EARLIER);
  });

  it('is opaque: the encoding is not the sort key in the clear', () => {
    const encoded = encodeActivityCursor(EARLIER);

    expect(encoded).not.toContain(EARLIER.id);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('keeps microsecond precision, which PostgreSQL timestamps carry', () => {
    const precise = { createdAt: '2026-10-09T10:00:00.123456Z', id: EARLIER.id };

    expect(decodeActivityCursor(encodeActivityCursor(precise)).createdAt).toBe(
      '2026-10-09T10:00:00.123456Z',
    );
  });
});

describe('rejecting a cursor the service did not produce (AC 8)', () => {
  const invalid: readonly [string, string][] = [
    ['not base64url at all', '!!!!'],
    ['base64 of something that is not JSON', Buffer.from('nope', 'utf8').toString('base64url')],
    ['an object instead of a tuple', Buffer.from('{"a":1}', 'utf8').toString('base64url')],
    ['the wrong arity', Buffer.from('["2026-10-09T10:00:00Z"]', 'utf8').toString('base64url')],
    ['a numeric id', Buffer.from('["2026-10-09T10:00:00Z",7]', 'utf8').toString('base64url')],
    ['a timestamp that is not a date', Buffer.from('["soon","id"]', 'utf8').toString('base64url')],
  ];

  it.each(invalid)('refuses %s', (_label, encoded) => {
    expect(() => decodeActivityCursor(encoded)).toThrow(InvalidActivityCursorError);
  });
});

describe('compareActivityOrder (newest first, ties by id desc)', () => {
  it('puts the later event first', () => {
    expect(compareActivityOrder(LATER, EARLIER)).toBeLessThan(0);
    expect(compareActivityOrder(EARLIER, LATER)).toBeGreaterThan(0);
  });

  it('breaks a shared timestamp by id, descending', () => {
    // Two events written by one transaction share `created_at` exactly.
    expect(compareActivityOrder(SAME_INSTANT, EARLIER)).toBeLessThan(0);
    expect(compareActivityOrder(EARLIER, SAME_INSTANT)).toBeGreaterThan(0);
  });

  it('is zero only for the same key', () => {
    expect(compareActivityOrder(EARLIER, { ...EARLIER })).toBe(0);
  });

  it('sorts a page the way the feed renders it', () => {
    const sorted = [EARLIER, LATER, SAME_INSTANT].sort(compareActivityOrder);

    expect(sorted).toStrictEqual([LATER, SAME_INSTANT, EARLIER]);
  });
});
