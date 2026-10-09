import { describe, expect, it } from 'vitest';
import {
  CARD_DESCRIPTION_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  cardCreateSchema,
  cardDetailSchema,
  cardIdParamsSchema,
  cardPatchSchema,
  cardSummarySchema,
} from './card.js';

/** FB-06 §10 unit row: the shared card schemas (CL-E38, CL-E41). */

const UUID = '3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f';
const OTHER_UUID = '7c2b8d1e-4f3a-4b5c-9d8e-2a1b3c4d5e6f';

describe('cardCreateSchema (AC 1, C-01)', () => {
  it('trims the title', () => {
    expect(cardCreateSchema.parse({ title: '  Write launch post  ' })).toStrictEqual({
      title: 'Write launch post',
    });
  });

  it('refuses an empty or whitespace-only title', () => {
    expect(cardCreateSchema.safeParse({ title: '' }).success).toBe(false);
    expect(cardCreateSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it(`accepts ${CARD_TITLE_MAX_LENGTH} characters and refuses one more`, () => {
    expect(cardCreateSchema.safeParse({ title: 'x'.repeat(CARD_TITLE_MAX_LENGTH) }).success).toBe(
      true,
    );
    expect(
      cardCreateSchema.safeParse({ title: 'x'.repeat(CARD_TITLE_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('bounds the title at 500 characters (FB-06 §3)', () => {
    expect(CARD_TITLE_MAX_LENGTH).toBe(500);
  });

  it('refuses an unknown field rather than ignoring it', () => {
    expect(cardCreateSchema.safeParse({ title: 'Card', position: 1024 }).success).toBe(false);
  });
});

describe('cardPatchSchema title and description (AC 3, AC 4)', () => {
  it('accepts a title alone and trims it', () => {
    expect(cardPatchSchema.parse({ title: '  Renamed  ' })).toStrictEqual({
      title: 'Renamed',
      via: 'drag',
    });
  });

  it('accepts null to clear the description (AC 4)', () => {
    expect(cardPatchSchema.parse({ description: null })).toStrictEqual({
      description: null,
      via: 'drag',
    });
  });

  it('accepts an empty description, which the route treats as cleared', () => {
    expect(cardPatchSchema.parse({ description: '' }).description).toBe('');
  });

  it('bounds the description at 10,000 characters after trailing whitespace (CL-D17)', () => {
    expect(CARD_DESCRIPTION_MAX_LENGTH).toBe(10_000);

    const atLimit = 'x'.repeat(CARD_DESCRIPTION_MAX_LENGTH);

    expect(cardPatchSchema.safeParse({ description: atLimit }).success).toBe(true);
    expect(cardPatchSchema.safeParse({ description: `${atLimit}x` }).success).toBe(false);

    // Trailing whitespace is stripped first, so a textarea that ends in a
    // newline at exactly the limit still saves (AC 4).
    const parsed = cardPatchSchema.parse({ description: `${atLimit}\n  \n` });
    expect(parsed.description).toBe(atLimit);
  });

  it('keeps leading and interior whitespace, which Markdown needs', () => {
    const text = '  indented\n\n- one\n- two';

    expect(cardPatchSchema.parse({ description: text }).description).toBe(text);
  });
});

describe('cardPatchSchema move rules (AC 5, CL-E35, CL-E41)', () => {
  it('defaults via to "drag" when it is absent', () => {
    expect(cardPatchSchema.parse({ position: 1536 }).via).toBe('drag');
  });

  it('accepts via "menu" for the C-11 picker', () => {
    expect(cardPatchSchema.parse({ position: 1536, via: 'menu' }).via).toBe('menu');
  });

  it('refuses via "sort", which only the FB-05 list route writes', () => {
    expect(cardPatchSchema.safeParse({ position: 1536, via: 'sort' }).success).toBe(false);
  });

  it('accepts listId together with position', () => {
    expect(cardPatchSchema.safeParse({ listId: UUID, position: 1536 }).success).toBe(true);
  });

  it('refuses listId without position', () => {
    const result = cardPatchSchema.safeParse({ listId: UUID });

    expect(result.success).toBe(false);
  });

  it('accepts a position alone, which reorders in place', () => {
    expect(cardPatchSchema.safeParse({ position: 512 }).success).toBe(true);
  });

  it('refuses a non-positive or non-finite position', () => {
    expect(cardPatchSchema.safeParse({ position: 0 }).success).toBe(false);
    expect(cardPatchSchema.safeParse({ position: -1 }).success).toBe(false);
    expect(cardPatchSchema.safeParse({ position: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});

describe('cardPatchSchema at-least-one-field (AC 3)', () => {
  it('refuses an empty body', () => {
    expect(cardPatchSchema.safeParse({}).success).toBe(false);
  });

  it('refuses via on its own, which is not an edit', () => {
    expect(cardPatchSchema.safeParse({ via: 'menu' }).success).toBe(false);
  });

  it('refuses an unknown field', () => {
    expect(cardPatchSchema.safeParse({ title: 'Card', archived: true }).success).toBe(false);
  });
});

describe('cardIdParamsSchema', () => {
  it('accepts a uuid and refuses anything else', () => {
    expect(cardIdParamsSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(cardIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('cardSummarySchema is unchanged by FB-06 (CL-E26, CL-E38)', () => {
  const summary = {
    id: UUID,
    listId: OTHER_UUID,
    title: 'Write launch post',
    position: 1024,
    dueAt: null,
    dueComplete: false,
    updatedAt: '2026-10-09T10:00:00.000Z',
    labelIds: [],
    memberIds: [],
    checklist: { done: 0, total: 0 },
    commentCount: 0,
    hasDescription: false,
  };

  it('accepts the FB-04 hydration shape exactly', () => {
    expect(cardSummarySchema.parse(summary)).toStrictEqual(summary);
  });

  it('has no createdBy: that field is on CardDetail alone', () => {
    expect(Object.keys(cardSummarySchema.shape)).not.toContain('createdBy');
    expect(Object.keys(cardSummarySchema.shape).sort()).toStrictEqual(Object.keys(summary).sort());
  });
});

describe('cardDetailSchema (AC 2, CL-E38)', () => {
  const detail = {
    id: UUID,
    listId: OTHER_UUID,
    title: 'Write launch post',
    position: 1024,
    dueAt: null,
    dueComplete: false,
    archivedAt: null,
    createdBy: UUID,
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
    description: null,
    boardId: OTHER_UUID,
    listName: 'To Do',
    labelIds: [],
    memberIds: [],
    checklistItems: [],
    commentCount: 0,
  };

  it('carries createdBy, the description, the board and the list name', () => {
    expect(cardDetailSchema.parse(detail)).toStrictEqual(detail);
  });

  it('accepts a string description and an archived timestamp', () => {
    const archived = {
      ...detail,
      description: '# not rendered here',
      archivedAt: '2026-10-09T11:00:00.000Z',
    };

    expect(cardDetailSchema.parse(archived).description).toBe('# not rendered here');
  });
});
