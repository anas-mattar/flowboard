/**
 * The public API version prefix. FS §7 fixes the public surface at `/v1`;
 * STANDARDS §1.2 requires a new versioned path for any breaking change.
 */
export const API_VERSION = 'v1' as const;

export type ApiVersion = typeof API_VERSION;

/**
 * Days an archived board, list or card is retained before the purge job
 * physically removes it (CL-A6, FB-17). One constant, referenced everywhere.
 */
export const ARCHIVE_RETENTION_DAYS = 30 as const;

/**
 * Gap between consecutive sparse-float positions when appending or
 * re-balancing (FS §5.1, FB-01 spec §4 item 3).
 */
export const POSITION_STEP = 1024 as const;

/**
 * Smallest neighbouring gap tolerated before a list needs re-balancing.
 * Below this, repeated midpoint inserts start losing precision in a
 * `double precision` column (FS §5.1).
 */
export const POSITION_MIN_GAP = 1e-6 as const;

/**
 * Board colours offered by the prototype board creator (PT `colors`).
 * Colour is never the only carrier of meaning (STANDARDS §1.6).
 */
export const BOARD_COLORS = ['#3d6df0', '#8f5bff', '#22a06b', '#e2703a', '#c9372c'] as const;

export type BoardColor = (typeof BOARD_COLORS)[number];

/**
 * Avatar colours (PT `USERS[].color`, FS §5 `avatar_color`). A new user is
 * assigned one deterministically by hashing their id (FB-02 §4 item 12), so
 * the same user always renders the same colour on every device without
 * storing a choice the user never made.
 *
 * The values coincide with `BOARD_COLORS` in the prototype, but the two are
 * separate vocabularies: re-theming boards must not re-colour people.
 */
export const AVATAR_COLORS = ['#3d6df0', '#8f5bff', '#22a06b', '#e2703a', '#c9372c'] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** A list created automatically with every new board (B-02). */
export interface DefaultList {
  readonly name: string;
  /** `null` means no WIP limit; the prototype stores `0` for the same thing. */
  readonly wipLimit: number | null;
}

/**
 * The three lists every new board starts with (B-02, prototype `createBoard`).
 */
export const DEFAULT_LISTS: readonly DefaultList[] = [
  { name: 'To Do', wipLimit: null },
  { name: 'Doing', wipLimit: 3 },
  { name: 'Done', wipLimit: null },
] as const;

/** A label created automatically with every new board (CL-D3). */
export interface DefaultLabel {
  readonly name: string;
  readonly color: string;
}

/**
 * The six board-scoped default labels (CL-D3), matching the prototype `LABELS`.
 */
export const DEFAULT_LABELS: readonly DefaultLabel[] = [
  { name: 'Bug', color: '#c9372c' },
  { name: 'Feature', color: '#22a06b' },
  { name: 'Design', color: '#8f5bff' },
  { name: 'Urgent', color: '#e2703a' },
  { name: 'Research', color: '#3d6df0' },
  { name: 'Blocked', color: '#6b778c' },
] as const;
