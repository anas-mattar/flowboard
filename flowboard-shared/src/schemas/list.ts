import { z } from 'zod';
import { uuidSchema } from './entities/common.js';

/**
 * List request and response schemas (FB-05 §6).
 *
 * The API validates every list request body and params with these and the web
 * app imports the inferred types, so the two never drift (STANDARDS §1.2).
 */

/**
 * List names are trimmed first, then bounded, so "  " is refused (CL-E33,
 * FB-05 AC 2).
 *
 * The stored `listSchema` still allows 120 characters: it describes rows FB-01
 * created, and narrowing it would make an older row fail to serialise. The
 * bound that matters is this one, on the way in.
 */
export const LIST_NAME_MAX_LENGTH = 80 as const;

/**
 * Upper bound on an advisory WIP limit (CL-E33). An engineering guard with no
 * FS source — any positive bound is acceptable and changing it is a one
 * constant change (FB-05 §12).
 */
export const WIP_LIMIT_MAX = 999 as const;

export const listNameFieldSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(LIST_NAME_MAX_LENGTH, 'validation.tooLong');

/**
 * A WIP limit as a client may set it: a whole number from 1 to 999, or `null`
 * to clear it (L-04, CL-D4, CL-E33). `0` is refused rather than treated as
 * "no limit", so clearing is always the explicit `null`.
 */
export const wipLimitFieldSchema = z
  .number()
  .int('validation.integer')
  .min(1, 'validation.tooSmall')
  .max(WIP_LIMIT_MAX, 'validation.tooLarge')
  .nullable();

/**
 * A sparse-float position as a client may set it (FS §5.1). Must be positive
 * and finite: `positionBetween` halves towards zero at the head, so a
 * non-positive position has no valid predecessor.
 */
export const listPositionFieldSchema = z
  .number()
  .finite('validation.finite')
  .positive('validation.tooSmall');

/** `POST /v1/boards/{id}/lists`. The new list is appended (CL-E33). */
export const listCreateSchema = z
  .object({ name: listNameFieldSchema })
  .strict()
  .describe('ListCreate');

export type ListCreate = z.infer<typeof listCreateSchema>;

/**
 * `PATCH /v1/lists/{id}`. At least one field must be present: an empty body is
 * a `422` rather than a silent no-op that would still bump `updatedAt`.
 *
 * `wipLimit` is `.nullable()` *and* `.optional()` for two different meanings —
 * absent leaves the limit alone, `null` clears it (AC 4).
 */
export const listPatchSchema = z
  .object({
    name: listNameFieldSchema.optional(),
    position: listPositionFieldSchema.optional(),
    wipLimit: wipLimitFieldSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'validation.atLeastOneField',
  })
  .describe('ListPatch');

export type ListPatch = z.infer<typeof listPatchSchema>;

/** The `{id}` of every list-scoped route. */
export const listIdParamsSchema = z.object({ id: uuidSchema }).describe('ListIdParams');

export type ListIdParams = z.infer<typeof listIdParamsSchema>;

/** `POST /v1/lists/{id}/archive-cards` (CL-E24, AC 6). */
export const listArchiveCardsResultSchema = z
  .object({ archivedCardIds: z.array(uuidSchema) })
  .describe('ListArchiveCardsResult');

export type ListArchiveCardsResult = z.infer<typeof listArchiveCardsResultSchema>;

/**
 * `POST /v1/lists/{id}/sort-by-due` (CL-E24, CL-A14, AC 5). `movedCardIds`
 * holds only the cards whose *rank* changed, in their new order, so a second
 * call on an already-sorted list returns an empty array.
 */
export const listSortByDueResultSchema = z
  .object({ movedCardIds: z.array(uuidSchema) })
  .describe('ListSortByDueResult');

export type ListSortByDueResult = z.infer<typeof listSortByDueResultSchema>;
