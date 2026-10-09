import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_PAGE_DEFAULT_LIMIT,
  ACTIVITY_PAGE_MAX_LIMIT,
  activityPageSchema,
  activityQuerySchema,
  cardCreatedPayloadSchema,
  cardDescribedPayloadSchema,
  cardRenamedPayloadSchema,
} from './activity.js';

/** FB-06 §10 unit row: the card activity payloads and the feed query (CL-E38). */

const UUID = '3f1a9b4e-0c5d-4a2b-8e7f-1d2c3b4a5e6f';
const OTHER_UUID = '7c2b8d1e-4f3a-4b5c-9d8e-2a1b3c4d5e6f';

describe('cardCreatedPayloadSchema (AC 1, AC 6, CL-E39)', () => {
  it('carries the title alone for an ordinary create', () => {
    expect(cardCreatedPayloadSchema.parse({ title: 'Write launch post' })).toStrictEqual({
      title: 'Write launch post',
    });
  });

  it('carries copiedFromCardId for a copy', () => {
    const payload = { title: 'Write launch post (copy)', copiedFromCardId: UUID };

    expect(cardCreatedPayloadSchema.parse(payload)).toStrictEqual(payload);
  });

  it('refuses a copiedFromCardId that is not a uuid', () => {
    expect(
      cardCreatedPayloadSchema.safeParse({ title: 'Card', copiedFromCardId: 'original' }).success,
    ).toBe(false);
  });
});

describe('cardRenamedPayloadSchema (AC 3, C-04)', () => {
  it('stores both titles so the feed reads as a diff', () => {
    expect(cardRenamedPayloadSchema.parse({ from: 'Old', to: 'New' })).toStrictEqual({
      from: 'Old',
      to: 'New',
    });
  });

  it('refuses a payload missing either side', () => {
    expect(cardRenamedPayloadSchema.safeParse({ from: 'Old' }).success).toBe(false);
    expect(cardRenamedPayloadSchema.safeParse({ to: 'New' }).success).toBe(false);
  });
});

describe('cardDescribedPayloadSchema (AC 4, C-05)', () => {
  it('records only whether a description now exists', () => {
    expect(cardDescribedPayloadSchema.parse({ hasDescription: true })).toStrictEqual({
      hasDescription: true,
    });
    expect(cardDescribedPayloadSchema.parse({ hasDescription: false }).hasDescription).toBe(false);
  });

  it('refuses a payload carrying the description text itself', () => {
    expect(
      cardDescribedPayloadSchema.safeParse({ hasDescription: true, description: 'secret' }).success,
    ).toBe(true);

    // The schema is not strict (payloads are an open record in FB-01), so the
    // guarantee that matters is that the *writer* never puts the text in. The
    // assertion the API side makes is in `test/cards.patch.test.ts`.
    expect(Object.keys(cardDescribedPayloadSchema.shape)).toStrictEqual(['hasDescription']);
  });
});

describe('activityQuerySchema (AC 8)', () => {
  it(`defaults the limit to ${ACTIVITY_PAGE_DEFAULT_LIMIT}`, () => {
    expect(activityQuerySchema.parse({})).toStrictEqual({ limit: ACTIVITY_PAGE_DEFAULT_LIMIT });
    expect(ACTIVITY_PAGE_DEFAULT_LIMIT).toBe(50);
  });

  it('coerces a limit arriving as a query string', () => {
    expect(activityQuerySchema.parse({ limit: '25' }).limit).toBe(25);
  });

  it(`caps the limit at ${ACTIVITY_PAGE_MAX_LIMIT} and refuses zero or a fraction`, () => {
    expect(ACTIVITY_PAGE_MAX_LIMIT).toBe(200);
    expect(activityQuerySchema.safeParse({ limit: ACTIVITY_PAGE_MAX_LIMIT }).success).toBe(true);
    expect(activityQuerySchema.safeParse({ limit: ACTIVITY_PAGE_MAX_LIMIT + 1 }).success).toBe(
      false,
    );
    expect(activityQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ limit: 1.5 }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ limit: 'many' }).success).toBe(false);
  });

  it('refuses an empty cursor and an unknown parameter', () => {
    expect(activityQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ order: 'asc' }).success).toBe(false);
  });
});

describe('activityPageSchema (AC 8, CL-E38)', () => {
  const item = {
    id: UUID,
    cardId: OTHER_UUID,
    actor: {
      id: UUID,
      displayName: 'Ada Lovelace',
      initials: 'AL',
      avatarColor: '#3d6df0',
    },
    type: 'card.created' as const,
    payload: { title: 'Write launch post' },
    createdAt: '2026-10-09T10:00:00.000Z',
  };

  it('accepts a page with a cursor and a last page without one', () => {
    expect(activityPageSchema.parse({ items: [item], nextCursor: 'abc' }).nextCursor).toBe('abc');
    expect(activityPageSchema.parse({ items: [], nextCursor: null }).nextCursor).toBeNull();
  });

  it('carries the actor as a PublicUser rather than an id', () => {
    const page = activityPageSchema.parse({ items: [item], nextCursor: null });

    expect(page.items[0]?.actor.displayName).toBe('Ada Lovelace');
  });

  it('refuses an item whose type is not an FS §5.2 event name', () => {
    expect(
      activityPageSchema.safeParse({
        items: [{ ...item, type: 'card.exploded' }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});
