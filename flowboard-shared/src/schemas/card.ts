import { z } from 'zod';
import { cardSchema } from './entities/card.js';
import { checklistItemSchema } from './entities/checklist-item.js';
import { uuidSchema } from './entities/common.js';
import { cardMovedViaSchema } from './activity.js';

/**
 * Card request and response schemas (FB-06 §6).
 *
 * The API validates every card request body, params and query with these and
 * the web app imports the inferred types, so the two never drift
 * (STANDARDS §1.2).
 */

/** C-01: a card title is 1 to 500 characters after trimming (FB-06 §3). */
export const CARD_TITLE_MAX_LENGTH = 500 as const;

/** CL-D17: the description is plain text, up to 10,000 characters. */
export const CARD_DESCRIPTION_MAX_LENGTH = 10_000 as const;

export const cardTitleFieldSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(CARD_TITLE_MAX_LENGTH, 'validation.tooLong');

/**
 * A description as a client may send it (C-05, CL-D17).
 *
 * The text is stored exactly as written — the server never renders, sanitises
 * or reflows Markdown, which is what makes the rendering decision entirely the
 * web app's (FB-06 §3). The one normalisation is trailing whitespace, which
 * FB-06 AC 4 bounds the length *after*: a textarea that ends in a stray newline
 * must not fail at 10,001 characters. Leading and interior whitespace is
 * significant in Markdown and is left alone.
 */
export const cardDescriptionFieldSchema = z
  .string()
  .transform((text) => text.replace(/\s+$/u, ''))
  .pipe(z.string().max(CARD_DESCRIPTION_MAX_LENGTH, 'validation.tooLong'));

/**
 * A sparse-float position as a client may set it (FS §5.1). Must be positive
 * and finite: `positionBetween` halves towards zero at the head, so a
 * non-positive position has no valid predecessor.
 */
export const cardPositionFieldSchema = z
  .number()
  .finite('validation.finite')
  .positive('validation.tooSmall');

/** `POST /v1/lists/{id}/cards` (C-01). The card is appended to the list. */
export const cardCreateSchema = z
  .object({ title: cardTitleFieldSchema })
  .strict()
  .describe('CardCreate');

export type CardCreate = z.infer<typeof cardCreateSchema>;

/**
 * `PATCH /v1/cards/{id}` (C-04, C-05, C-11, CL-E23, CL-E35, CL-E41).
 *
 * One body carries three different edits because FS §7 makes a move an edit:
 * the title, the description, and the `listId` + `position` pair. Two rules
 * keep that unambiguous:
 *
 * - at least one of `title`, `description`, `position` must be present, so an
 *   empty body is a `422` rather than a silent no-op that still bumps
 *   `updatedAt`. `via` alone is not an edit;
 * - `listId` requires `position` (FB-06 AC 5). A list without a position has no
 *   defined landing place, and guessing one ("the end") would make a dropped
 *   `position` field silently reorder the board.
 *
 * `description` is `.nullable()` *and* `.optional()` for two different meanings:
 * absent leaves it alone, `null` clears it (AC 4).
 */
export const cardPatchSchema = z
  .object({
    title: cardTitleFieldSchema.optional(),
    description: cardDescriptionFieldSchema.nullable().optional(),
    listId: uuidSchema.optional(),
    position: cardPositionFieldSchema.optional(),
    /** CL-E35. Defaults to `"drag"`; only meaningful alongside `position`. */
    via: cardMovedViaSchema.exclude(['sort']).default('drag'),
  })
  .strict()
  .refine(
    (patch) =>
      patch.title !== undefined || patch.description !== undefined || patch.position !== undefined,
    { message: 'validation.atLeastOneField' },
  )
  .refine((patch) => patch.listId === undefined || patch.position !== undefined, {
    message: 'validation.positionRequired',
    path: ['position'],
  })
  .describe('CardPatch');

export type CardPatch = z.infer<typeof cardPatchSchema>;

/** The `{id}` of every card-scoped route. */
export const cardIdParamsSchema = z.object({ id: uuidSchema }).describe('CardIdParams');

export type CardIdParams = z.infer<typeof cardIdParamsSchema>;

/**
 * A card as the board canvas needs it (FB-04 §6, FB-06 §6).
 *
 * This shape moved here from `board.ts` when FB-06 gave cards their own module;
 * `board.ts` re-exports it so the FB-04 imports keep working. Its field set is
 * deliberately **unchanged**: hydration carries only the counts the front of
 * the card shows, and `createdBy` is exposed on `CardDetail` alone (CL-E26,
 * CL-E38).
 */
export const cardSummarySchema = cardSchema
  .pick({
    id: true,
    listId: true,
    title: true,
    position: true,
    dueAt: true,
    dueComplete: true,
    updatedAt: true,
  })
  .extend({
    labelIds: z.array(uuidSchema),
    memberIds: z.array(uuidSchema),
    checklist: z.object({
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    commentCount: z.number().int().nonnegative(),
    hasDescription: z.boolean(),
  })
  .describe('CardSummary');

export type CardSummary = z.infer<typeof cardSummarySchema>;

/**
 * What the card modal loads lazily (C-03, CL-E26, CL-E38): everything the
 * summary leaves out, including the description itself and the `boardId` the
 * modal route needs to resolve its parent board.
 *
 * `listName` is denormalised into the response because the modal's location
 * line renders it (FS §4.7) and the client otherwise has to hold the whole
 * board to translate one id.
 */
export const cardDetailSchema = cardSchema
  .extend({
    description: z.string().nullable(),
    boardId: uuidSchema,
    listName: z.string(),
    labelIds: z.array(uuidSchema),
    memberIds: z.array(uuidSchema),
    checklistItems: z.array(checklistItemSchema),
    commentCount: z.number().int().nonnegative(),
  })
  .describe('CardDetail');

export type CardDetail = z.infer<typeof cardDetailSchema>;
