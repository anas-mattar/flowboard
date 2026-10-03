import { describe, expect, it } from 'vitest';
import { BOARD_COLORS, nextBoardColor } from '../constants.js';
import {
  BOARD_LIST_DEFAULT_LIMIT,
  BOARD_LIST_MAX_LIMIT,
  BOARD_NAME_MAX_LENGTH,
  boardCreateSchema,
  boardListQuerySchema,
  boardPatchSchema,
} from './board.js';

/**
 * FB-04 §10 unit row: name trim and bounds, colour format, patch requires one
 * field. Each case is an acceptance criterion the route then relies on.
 */

describe('boardCreateSchema (AC 5)', () => {
  it('trims the name before validating and before storing it', () => {
    expect(boardCreateSchema.parse({ name: '  Launch  ' }).name).toBe('Launch');
  });

  it('rejects a name that is only whitespace', () => {
    expect(boardCreateSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('accepts exactly 120 characters and rejects 121', () => {
    const atLimit = 'a'.repeat(BOARD_NAME_MAX_LENGTH);

    expect(boardCreateSchema.safeParse({ name: atLimit }).success).toBe(true);
    expect(boardCreateSchema.safeParse({ name: `${atLimit}a` }).success).toBe(false);
  });

  it('applies the length bound after trimming, so padding does not consume it', () => {
    const padded = `  ${'a'.repeat(BOARD_NAME_MAX_LENGTH)}  `;

    expect(boardCreateSchema.safeParse({ name: padded }).success).toBe(true);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    expect(boardCreateSchema.safeParse({ name: 'Launch', color: '#3d6df0' }).success).toBe(false);
  });

  it('leaves workspaceId absent when it is not sent (CL-D7 default)', () => {
    expect(boardCreateSchema.parse({ name: 'Launch' }).workspaceId).toBeUndefined();
  });

  it('rejects a workspaceId that is not a uuid', () => {
    expect(boardCreateSchema.safeParse({ name: 'Launch', workspaceId: 'nope' }).success).toBe(
      false,
    );
  });
});

describe('boardPatchSchema (AC 5, AC 6, AC 7)', () => {
  it('requires at least one field', () => {
    expect(boardPatchSchema.safeParse({}).success).toBe(false);
  });

  it.each([
    ['name', { name: 'Renamed' }],
    ['color', { color: '#8f5bff' }],
    ['starred', { starred: true }],
    ['archived', { archived: true }],
  ])('accepts %s on its own', (_field, patch) => {
    expect(boardPatchSchema.safeParse(patch).success).toBe(true);
  });

  it('trims a name and refuses one that is blank after trimming', () => {
    expect(boardPatchSchema.parse({ name: '  Renamed  ' }).name).toBe('Renamed');
    expect(boardPatchSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('accepts a #rrggbb colour in either case and rejects other formats', () => {
    expect(boardPatchSchema.safeParse({ color: '#3d6df0' }).success).toBe(true);
    expect(boardPatchSchema.safeParse({ color: '#3D6DF0' }).success).toBe(true);
    expect(boardPatchSchema.safeParse({ color: '#abc' }).success).toBe(false);
    expect(boardPatchSchema.safeParse({ color: 'red' }).success).toBe(false);
    expect(boardPatchSchema.safeParse({ color: '3d6df0' }).success).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(boardPatchSchema.safeParse({ name: 'Renamed', archivedAt: null }).success).toBe(false);
  });

  it('treats archived: false as a present field, so unarchiving is not an empty patch', () => {
    expect(boardPatchSchema.safeParse({ archived: false }).success).toBe(true);
  });
});

describe('boardListQuerySchema (AC 3)', () => {
  it('defaults the limit to 50 when none is sent', () => {
    expect(boardListQuerySchema.parse({}).limit).toBe(BOARD_LIST_DEFAULT_LIMIT);
  });

  it('coerces the limit from the string the query string carries', () => {
    expect(boardListQuerySchema.parse({ limit: '25' }).limit).toBe(25);
  });

  it('rejects a limit above the maximum, below one, or not a number', () => {
    expect(boardListQuerySchema.safeParse({ limit: BOARD_LIST_MAX_LIMIT + 1 }).success).toBe(false);
    expect(boardListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(boardListQuerySchema.safeParse({ limit: 'many' }).success).toBe(false);
  });

  it('accepts the maximum limit itself', () => {
    expect(boardListQuerySchema.parse({ limit: BOARD_LIST_MAX_LIMIT }).limit).toBe(
      BOARD_LIST_MAX_LIMIT,
    );
  });

  it('rejects an unknown query parameter', () => {
    expect(boardListQuerySchema.safeParse({ sort: 'name' }).success).toBe(false);
  });
});

describe('nextBoardColor (CL-A12, CL-E15)', () => {
  it('walks the palette in order for the first five boards', () => {
    expect(BOARD_COLORS.map((_color, index) => nextBoardColor(index))).toEqual([...BOARD_COLORS]);
  });

  it('cycles once the palette is exhausted', () => {
    expect(nextBoardColor(BOARD_COLORS.length)).toBe(BOARD_COLORS[0]);
    expect(nextBoardColor(BOARD_COLORS.length + 2)).toBe(BOARD_COLORS[2]);
  });

  it('refuses a negative or non-integer count, which would be a caller bug', () => {
    expect(() => nextBoardColor(-1)).toThrow(RangeError);
    expect(() => nextBoardColor(1.5)).toThrow(RangeError);
  });
});
