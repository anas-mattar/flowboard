/**
 * Cursor encoding for `GET /v1/cards/{id}/activity` (FB-06 §6, CL-E38).
 *
 * The feed is ordered `created_at desc, id desc`. `created_at` alone is not a
 * key: one `PATCH` can write a rename and a move in the same transaction, and
 * `now()` is constant inside a transaction in PostgreSQL, so two events share a
 * timestamp to the microsecond. `id` is the tie-breaker that makes the order
 * total, which is what lets the cursor be a keyset rather than an offset — an
 * event appended between two page fetches cannot make a row repeat or
 * disappear the way `OFFSET` would.
 *
 * Pure module, so the encoding is unit-tested without a database
 * (FB-06 §10 unit row, STANDARDS §4).
 */

/** The ordering key of one event, in comparison order. */
export interface ActivityCursor {
  /** The event's `created_at`, as the UTC ISO 8601 string it is sent as. */
  readonly createdAt: string;
  readonly id: string;
}

/** Raised when a client sends a cursor this service did not produce. */
export class InvalidActivityCursorError extends Error {
  public override readonly name = 'InvalidActivityCursorError';
}

/**
 * Encodes a cursor as base64url. Opaque by intent: FS §7 promises clients a
 * cursor, not a sort key they may construct, so the encoding can change
 * without a new API version.
 */
export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id]), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor, or throws `InvalidActivityCursorError` so the route can
 * answer `422` (AC 8) rather than a `500`. Every malformed shape lands here:
 * bad base64, bad JSON, wrong arity, wrong types, and a timestamp that is not a
 * date — the last one matters because it would otherwise reach the driver as a
 * `timestamptz` parameter and fail there as a 500.
 */
export function decodeActivityCursor(encoded: string): ActivityCursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidActivityCursorError('cursor is not a valid encoded value');
  }

  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new InvalidActivityCursorError('cursor does not carry two ordering fields');
  }

  const [createdAt, id] = parsed as readonly unknown[];

  if (typeof createdAt !== 'string' || typeof id !== 'string') {
    throw new InvalidActivityCursorError('cursor fields have the wrong types');
  }

  if (Number.isNaN(Date.parse(createdAt))) {
    throw new InvalidActivityCursorError('cursor does not carry a timestamp');
  }

  return { createdAt, id };
}

/**
 * Orders events the way the feed renders them: newest first, ties broken by id
 * descending. Exported so the unit test states the rule once and the
 * integration test can assert the route agrees with it.
 *
 * Ids are compared as strings. PostgreSQL compares `uuid` by its bytes, and the
 * canonical lowercase hex rendering orders identically byte for byte, so this
 * agrees with the SQL keyset predicate about which row a cursor points past —
 * which is the property that matters, since the two must never disagree.
 */
export function compareActivityOrder(left: ActivityCursor, right: ActivityCursor): number {
  const leftAt = Date.parse(left.createdAt);
  const rightAt = Date.parse(right.createdAt);

  if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1;

  if (left.id === right.id) return 0;

  return left.id < right.id ? 1 : -1;
}
