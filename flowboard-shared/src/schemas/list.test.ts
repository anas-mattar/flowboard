import { describe, expect, it } from 'vitest';
import {
  LIST_NAME_MAX_LENGTH,
  WIP_LIMIT_MAX,
  listCreateSchema,
  listIdParamsSchema,
  listPatchSchema,
  listArchiveCardsResultSchema,
  listSortByDueResultSchema,
} from './list.js';
import { cardArchivedPayloadSchema, cardMovedPayloadSchema } from './activity.js';

/** FB-05 §10 unit row: the shared list schemas (CL-E33, CL-E35). */

const UUID = '3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f';
const OTHER_UUID = '7c2b8d1e-4f3a-4b5c-9d8e-2a1b3c4d5e6f';

describe('listCreateSchema (AC 1, CL-E33)', () => {
  it('trims the name', () => {
    expect(listCreateSchema.parse({ name: '  Review  ' })).toStrictEqual({ name: 'Review' });
  });

  it('refuses an empty or whitespace-only name', () => {
    expect(listCreateSchema.safeParse({ name: '' }).success).toBe(false);
    expect(listCreateSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it(`accepts ${LIST_NAME_MAX_LENGTH} characters and refuses one more`, () => {
    expect(listCreateSchema.safeParse({ name: 'x'.repeat(LIST_NAME_MAX_LENGTH) }).success).toBe(
      true,
    );
    expect(listCreateSchema.safeParse({ name: 'x'.repeat(LIST_NAME_MAX_LENGTH + 1) }).success).toBe(
      false,
    );
  });

  it('bounds the name at 80 characters (CL-E33)', () => {
    expect(LIST_NAME_MAX_LENGTH).toBe(80);
  });

  it('refuses an unknown field rather than ignoring it', () => {
    expect(listCreateSchema.safeParse({ name: 'Review', position: 1024 }).success).toBe(false);
  });
});

describe('listPatchSchema (AC 2 to 4)', () => {
  it('accepts each field on its own', () => {
    expect(listPatchSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
    expect(listPatchSchema.safeParse({ position: 1536 }).success).toBe(true);
    expect(listPatchSchema.safeParse({ wipLimit: 3 }).success).toBe(true);
  });

  it('refuses an empty body', () => {
    expect(listPatchSchema.safeParse({}).success).toBe(false);
  });

  it('clears the limit with an explicit null (AC 4)', () => {
    expect(listPatchSchema.parse({ wipLimit: null })).toStrictEqual({ wipLimit: null });
  });

  it('refuses 0, a negative, a fraction and a value above the maximum (AC 4)', () => {
    expect(listPatchSchema.safeParse({ wipLimit: 0 }).success).toBe(false);
    expect(listPatchSchema.safeParse({ wipLimit: -1 }).success).toBe(false);
    expect(listPatchSchema.safeParse({ wipLimit: 2.5 }).success).toBe(false);
    expect(listPatchSchema.safeParse({ wipLimit: WIP_LIMIT_MAX + 1 }).success).toBe(false);
  });

  it(`accepts 1 and ${WIP_LIMIT_MAX} at the bounds`, () => {
    expect(listPatchSchema.safeParse({ wipLimit: 1 }).success).toBe(true);
    expect(listPatchSchema.safeParse({ wipLimit: WIP_LIMIT_MAX }).success).toBe(true);
  });

  it('bounds the WIP limit at 999 (CL-E33)', () => {
    expect(WIP_LIMIT_MAX).toBe(999);
  });

  it('refuses a non-positive or non-finite position (AC 3)', () => {
    expect(listPatchSchema.safeParse({ position: 0 }).success).toBe(false);
    expect(listPatchSchema.safeParse({ position: -1 }).success).toBe(false);
    expect(listPatchSchema.safeParse({ position: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(listPatchSchema.safeParse({ position: Number.NaN }).success).toBe(false);
  });

  it('accepts a fractional position, which is how a drop between neighbours lands', () => {
    expect(listPatchSchema.safeParse({ position: 1536.5 }).success).toBe(true);
  });

  it('trims a patched name and refuses a blank one', () => {
    expect(listPatchSchema.parse({ name: '  Doing  ' })).toStrictEqual({ name: 'Doing' });
    expect(listPatchSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('listIdParamsSchema', () => {
  it('accepts a uuid and refuses anything else', () => {
    expect(listIdParamsSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(listIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('the result schemas (CL-E24)', () => {
  it('validates archive-cards and sort-by-due results', () => {
    expect(listArchiveCardsResultSchema.safeParse({ archivedCardIds: [UUID] }).success).toBe(true);
    expect(listSortByDueResultSchema.safeParse({ movedCardIds: [] }).success).toBe(true);
  });

  it('refuses an id that is not a uuid', () => {
    expect(listSortByDueResultSchema.safeParse({ movedCardIds: ['nope'] }).success).toBe(false);
  });
});

describe('the activity payload schemas (CL-E35)', () => {
  it('validates a card.moved payload written by a sort', () => {
    const payload = {
      fromListId: UUID,
      toListId: UUID,
      fromPosition: 2048,
      toPosition: 1024,
      via: 'sort',
    };

    expect(cardMovedPayloadSchema.parse(payload)).toStrictEqual(payload);
  });

  it('accepts the three movement sources and refuses another', () => {
    for (const via of ['drag', 'menu', 'sort']) {
      expect(
        cardMovedPayloadSchema.safeParse({
          fromListId: UUID,
          toListId: OTHER_UUID,
          fromPosition: 1024,
          toPosition: 2048,
          via,
        }).success,
      ).toBe(true);
    }

    expect(
      cardMovedPayloadSchema.safeParse({
        fromListId: UUID,
        toListId: OTHER_UUID,
        fromPosition: 1024,
        toPosition: 2048,
        via: 'teleport',
      }).success,
    ).toBe(false);
  });

  it('accepts the three archive sources and refuses another (CL-E34)', () => {
    for (const via of ['card', 'archive_all', 'list_archived']) {
      expect(cardArchivedPayloadSchema.safeParse({ via }).success).toBe(true);
    }

    expect(cardArchivedPayloadSchema.safeParse({ via: 'deleted' }).success).toBe(false);
  });
});
