import { z } from 'zod';
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
