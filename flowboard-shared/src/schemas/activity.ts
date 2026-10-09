import { z } from 'zod';
import { activityEventSchema } from './entities/activity-event.js';
import { uuidSchema } from './entities/common.js';

/**
 * Activity event payload shapes (FS §5.2, CL-E35).
 *
 * `ActivityEvent.payload` stays an open record (FB-01) because the feed renders
 * fifteen event types with different shapes. These schemas are the contract for
 * the two payloads FB-05 writes: the API validates what it stores and the feed
 * validates what it renders, so the stored row, the realtime frame and the
 * rendered entry cannot drift apart.
 */

/**
 * How a card came to move (CL-E35). `drag` is the FB-07 gesture, `menu` the
 * FB-06 "move to" action, `sort` the FB-05 sort-by-due rewrite.
 */
export const CARD_MOVED_VIA = ['drag', 'menu', 'sort'] as const;

export type CardMovedVia = (typeof CARD_MOVED_VIA)[number];

export const cardMovedViaSchema = z.enum(CARD_MOVED_VIA);

/**
 * `card.moved`. A sort writes `fromListId === toListId`: the card keeps its
 * list and only its position is rewritten (CL-A14).
 */
export const cardMovedPayloadSchema = z
  .object({
    fromListId: uuidSchema,
    toListId: uuidSchema,
    fromPosition: z.number().finite(),
    toPosition: z.number().finite(),
    via: cardMovedViaSchema,
  })
  .describe('CardMovedPayload');

export type CardMovedPayload = z.infer<typeof cardMovedPayloadSchema>;

/**
 * How a card came to be archived (CL-E34). `card` is archiving one card,
 * `archive_all` the list's "Archive all cards", `list_archived` the cascade
 * from deleting the list — the three are distinguished so FB-17 can restore
 * exactly what a single undo should restore.
 */
export const CARD_ARCHIVED_VIA = ['card', 'archive_all', 'list_archived'] as const;

export type CardArchivedVia = (typeof CARD_ARCHIVED_VIA)[number];

export const cardArchivedViaSchema = z.enum(CARD_ARCHIVED_VIA);

/** `card.archived`. */
export const cardArchivedPayloadSchema = z
  .object({ via: cardArchivedViaSchema })
  .describe('CardArchivedPayload');

export type CardArchivedPayload = z.infer<typeof cardArchivedPayloadSchema>;

/**
 * `card.created` (FB-06 AC 1, AC 6). `copiedFromCardId` is present only on the
 * event written for a copy (CL-E39), which is what lets the feed render
 * "created this card (copied from …)" without a second lookup.
 */
export const cardCreatedPayloadSchema = z
  .object({
    title: z.string(),
    copiedFromCardId: uuidSchema.optional(),
  })
  .describe('CardCreatedPayload');

export type CardCreatedPayload = z.infer<typeof cardCreatedPayloadSchema>;

/** `card.renamed` (C-04). Both titles are stored so the feed reads as a diff. */
export const cardRenamedPayloadSchema = z
  .object({ from: z.string(), to: z.string() })
  .describe('CardRenamedPayload');

export type CardRenamedPayload = z.infer<typeof cardRenamedPayloadSchema>;

/**
 * `card.described` (C-05). The description itself is deliberately **not** in
 * the payload: it can be 10,000 characters, the feed only renders "updated" or
 * "removed" (FB-06 AC 19), and an audit row is not a revision history.
 */
export const cardDescribedPayloadSchema = z
  .object({ hasDescription: z.boolean() })
  .describe('CardDescribedPayload');

export type CardDescribedPayload = z.infer<typeof cardDescribedPayloadSchema>;

/** Default and maximum page size of the activity feed (FB-06 §3, §6). */
export const ACTIVITY_PAGE_DEFAULT_LIMIT = 50 as const;
export const ACTIVITY_PAGE_MAX_LIMIT = 200 as const;

/**
 * `GET /v1/cards/{id}/activity` query. `limit` arrives as a string on the wire,
 * so it is coerced here rather than in the route; a non-numeric value fails
 * validation and becomes a `422` (FB-06 AC 8).
 */
export const activityQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(ACTIVITY_PAGE_MAX_LIMIT)
      .default(ACTIVITY_PAGE_DEFAULT_LIMIT),
  })
  .strict()
  .describe('ActivityQuery');

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/**
 * One page of a card's activity, newest first (FS §7, CL-E38). The cursor
 * encodes `(createdAt, id)` so two events written in the same millisecond — a
 * rename and a move inside one `PATCH` — still have a definite successor.
 */
export const activityPageSchema = z
  .object({
    items: z.array(activityEventSchema),
    /** `null` on the last page (AC 8). */
    nextCursor: z.string().min(1).nullable(),
  })
  .describe('ActivityPage');

export type ActivityPage = z.infer<typeof activityPageSchema>;
