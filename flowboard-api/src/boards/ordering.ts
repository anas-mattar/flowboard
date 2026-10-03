/**
 * Sidebar ordering and cursor encoding for `GET /v1/boards` (FB-04 §6).
 *
 * The order is `starred desc, lower(name) asc, id asc` (CL-E17). `id` is the
 * tie-breaker that makes the order total, which is what lets the cursor be a
 * keyset rather than an offset: two boards named "Launch" still have a
 * definite successor, and a board created or renamed between pages cannot
 * make a row repeat or disappear the way `OFFSET` would.
 *
 * Pure module, so the encoding is unit-tested without a database
 * (FB-04 §10 unit row, STANDARDS §4).
 */

/** The ordering key of one row, in comparison order. */
export interface BoardCursor {
  /** The caller's own star (CL-E14). Starred rows sort first. */
  readonly starred: boolean;
  /** The board name, already lower-cased, so sorting is case-insensitive. */
  readonly lowerName: string;
  readonly id: string;
}

/** Raised when a client sends a cursor this service did not produce. */
export class InvalidCursorError extends Error {
  public override readonly name = 'InvalidCursorError';
}

/**
 * `starred desc` expressed as an ascending rank, so the whole key compares in
 * one direction and the SQL keyset predicate below stays a plain tuple
 * comparison instead of a mix of `>` and `<`.
 */
export function starredRank(starred: boolean): number {
  return starred ? 0 : 1;
}

/**
 * Encodes a cursor as base64url. Opaque by intent: FS §7 promises clients a
 * cursor, not a sort key they may construct, so the encoding can change
 * without a new API version.
 */
export function encodeBoardCursor(cursor: BoardCursor): string {
  const payload = JSON.stringify([starredRank(cursor.starred), cursor.lowerName, cursor.id]);

  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decodes a cursor, or throws `InvalidCursorError` so the route can answer
 * `422` (FB-04 §6 "422 bad cursor or limit") rather than a `500`. Every
 * malformed shape lands here: bad base64, bad JSON, wrong arity, wrong types.
 */
export function decodeBoardCursor(encoded: string): BoardCursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError('cursor is not a valid encoded value');
  }

  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new InvalidCursorError('cursor does not carry three ordering fields');
  }

  const [rank, lowerName, id] = parsed as readonly unknown[];

  if ((rank !== 0 && rank !== 1) || typeof lowerName !== 'string' || typeof id !== 'string') {
    throw new InvalidCursorError('cursor fields have the wrong types');
  }

  return { starred: rank === 0, lowerName, id };
}

/**
 * Orders rows the way the sidebar renders them (B-01, B-04). Exported so the
 * unit test can state the rule once and the integration test can assert the
 * route agrees with it.
 *
 * Names are compared by code unit rather than with `localeCompare`, because
 * PostgreSQL compares `lower(name)` in the database collation and the two must
 * not disagree about which row a cursor points past.
 */
export function compareBoardOrder(left: BoardCursor, right: BoardCursor): number {
  const byStar = starredRank(left.starred) - starredRank(right.starred);
  if (byStar !== 0) return byStar;

  if (left.lowerName !== right.lowerName) return left.lowerName < right.lowerName ? -1 : 1;

  if (left.id === right.id) return 0;

  return left.id < right.id ? -1 : 1;
}
