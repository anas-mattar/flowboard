import { z } from 'zod';
import { boardRoleSchema } from './roles.js';
import { boardSchema } from './entities/board.js';
import { cardSummarySchema } from './card.js';
import { hexColorSchema, uuidSchema } from './entities/common.js';
import { labelSchema } from './entities/label.js';
import { listSchema } from './entities/list.js';
import { publicUserSchema } from './entities/user.js';

/**
 * Board request and response schemas (FB-04 §6).
 *
 * The API validates every board request body, params and query with these and
 * the web app imports the inferred types, so the two never drift
 * (STANDARDS §1.2).
 */

/** Board names are trimmed first, then bounded, so "  " is refused (AC 5). */
export const BOARD_NAME_MAX_LENGTH = 120 as const;

export const boardNameFieldSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(BOARD_NAME_MAX_LENGTH, 'validation.tooLong');

/** Default and maximum page size of `GET /v1/boards` (FB-04 §6, AC 3). */
export const BOARD_LIST_DEFAULT_LIMIT = 50 as const;
export const BOARD_LIST_MAX_LIMIT = 200 as const;

/**
 * A sidebar row (B-01). `starred` is the caller's own star (CL-E14) and
 * `cardCount` counts non-archived cards on non-archived lists (CL-E17).
 *
 * `archivedAt` is always `null` in a `GET /v1/boards` page — the list only
 * returns live boards — but it is kept in the shape so the same schema
 * validates the `PATCH` response, which does report an archive.
 */
export const boardSummarySchema = boardSchema
  .extend({
    starred: z.boolean(),
    cardCount: z.number().int().nonnegative(),
  })
  .describe('BoardSummary');

export type BoardSummary = z.infer<typeof boardSummarySchema>;

/** One cursor-paginated page of sidebar rows (FS §7). */
export const boardListSchema = z
  .object({
    items: z.array(boardSummarySchema),
    /** `null` on the last page (AC 3). */
    nextCursor: z.string().min(1).nullable(),
  })
  .describe('BoardList');

export type BoardList = z.infer<typeof boardListSchema>;

/**
 * `GET /v1/boards` query. `limit` arrives as a string on the wire, so it is
 * coerced here rather than in the route; a non-numeric value fails validation
 * and becomes a `422` (FB-04 §6).
 */
export const boardListQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(BOARD_LIST_MAX_LIMIT)
      .default(BOARD_LIST_DEFAULT_LIMIT),
  })
  .strict()
  .describe('BoardListQuery');

export type BoardListQuery = z.infer<typeof boardListQuerySchema>;

/**
 * `POST /v1/boards`. `workspaceId` defaults to the caller's current workspace
 * (CL-D7); a workspace the caller has not joined is refused with `422`, not
 * `403`, so the endpoint never confirms that a workspace id exists (AC 8).
 */
export const boardCreateSchema = z
  .object({
    name: boardNameFieldSchema,
    workspaceId: uuidSchema.optional(),
  })
  .strict()
  .describe('BoardCreate');

export type BoardCreate = z.infer<typeof boardCreateSchema>;

/**
 * `PATCH /v1/boards/{id}`. At least one field must be present: an empty body
 * is a `422` rather than a silent no-op that would still bump `updatedAt`.
 *
 * `starred` is deliberately in the same body as the board edits even though it
 * is a per-user row (CL-E14); §6 records that it does not move `updatedAt`.
 */
export const boardPatchSchema = z
  .object({
    name: boardNameFieldSchema.optional(),
    color: hexColorSchema.optional(),
    starred: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'validation.atLeastOneField',
  })
  .describe('BoardPatch');

export type BoardPatch = z.infer<typeof boardPatchSchema>;

/** A board membership as the board page renders it (FB-04 §6). */
export const boardMemberViewSchema = z
  .object({
    user: publicUserSchema,
    role: boardRoleSchema,
  })
  .describe('BoardMemberView');

export type BoardMemberView = z.infer<typeof boardMemberViewSchema>;

/**
 * A card as the board canvas needs it. The schema itself lives in `card.ts`
 * since FB-06 §6 gave cards their own module; it is re-exported here so the
 * FB-04 imports (`@flowboard/shared` and this file alike) keep working and its
 * field set stays exactly what hydration promised.
 */
export { cardSummarySchema };
export type { CardSummary } from './card.js';

/** A non-archived list with its non-archived cards in position order (AC 4). */
export const listWithCardsSchema = listSchema
  .extend({
    cards: z.array(cardSummarySchema),
  })
  .describe('ListWithCards');

export type ListWithCards = z.infer<typeof listWithCardsSchema>;

/**
 * What the caller may do on this board, resolved server-side so the UI can
 * hide what is not permitted without guessing (FS §6). `workspace_admin` is
 * the caller who administers the workspace but is not on the board.
 */
export const boardCallerRoleSchema = z
  .enum(['admin', 'member', 'observer', 'workspace_admin'])
  .describe('BoardCallerRole');

export type BoardCallerRole = z.infer<typeof boardCallerRoleSchema>;

/**
 * The single hydration response (FS §7, AC 4): everything the board page needs
 * to render in one round trip.
 */
export const boardHydratedSchema = z
  .object({
    board: boardSchema,
    members: z.array(boardMemberViewSchema),
    labels: z.array(labelSchema),
    lists: z.array(listWithCardsSchema),
    starred: z.boolean(),
    callerRole: boardCallerRoleSchema,
  })
  .describe('BoardHydrated');

export type BoardHydrated = z.infer<typeof boardHydratedSchema>;
