import {
  API_ERROR_CODES,
  activityPageSchema,
  activityQuerySchema,
  apiErrorSchema,
  cardCreateSchema,
  cardDetailSchema,
  cardIdParamsSchema,
  cardPatchSchema,
  cardSummarySchema,
  listIdParamsSchema,
  type ActivityPage,
  type CardDetail,
  type CardSummary,
} from '@flowboard/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { can } from '../authz/can.js';
import { findListAccess } from '../repositories/list.js';
import {
  InvalidActivityCursorError,
  archiveCard,
  copyCard,
  createCard,
  findCardAccess,
  findCardDetail,
  findCardSummary,
  listCardActivity,
  updateCard,
  type CardAccess,
  type MoveRejection,
} from '../repositories/card.js';
import { presentActivityEvent, presentCardDetail, presentCardSummary } from './presenters.js';
import { ifMatchIsStale } from './boards.js';
import type { RouteDependencies } from './dependencies.js';

/**
 * The FB-06 card routes (§6): create, detail, patch (title, description and
 * move), delete, copy and the activity feed.
 *
 * Every authorisation decision goes through `can()` with `board.manageCards`
 * (mutations) or `board.view` (reads) resolved from the card's own board, never
 * from the request (STANDARDS §1.4). The two outcomes stay distinct, as on
 * boards and lists: a caller who cannot *see* the board gets `404`, a caller
 * who can see it but not change it gets `403`. That is what makes the Observer
 * column of §8 a `403` and the off-board columns a `404`.
 */

const errorResponses = {
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
};

function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

/** The `404` body every "you may not see this" branch returns. */
function cardNotFound(): ReturnType<typeof error> {
  return error(API_ERROR_CODES.notFound, 'Card not found');
}

function forbidden(): ReturnType<typeof error> {
  return error(API_ERROR_CODES.forbidden, 'Not permitted');
}

/** Whether the board behind `access` is visible to the caller at all. */
function boardIsVisible(userId: string, access: CardAccess | null): access is CardAccess {
  if (access === null || !access.visible || !can({ userId }, 'board.view', access)) return false;

  // CL-E16: an archived board is invisible to everyone who cannot restore it,
  // so its lists and cards are too.
  return access.board.archivedAt === null || can({ userId }, 'board.manage', access);
}

/**
 * Resolves a card for a *read* (AC 2, AC 8).
 *
 * An archived card stays readable for the roles that can restore it — board
 * admin and workspace admin (FB-17) — and is simply absent for everyone else,
 * the same rule CL-E16 fixes for an archived board.
 */
async function resolveCardForRead(
  db: RouteDependencies['db'],
  cardId: string,
  userId: string,
): Promise<{ readonly access: CardAccess } | { readonly status: 404 }> {
  const access = await findCardAccess(db, cardId, userId);

  if (!boardIsVisible(userId, access)) return { status: 404 };

  if (access.card.archivedAt !== null && !can({ userId }, 'board.manage', access)) {
    return { status: 404 };
  }

  return { access };
}

/**
 * Resolves a card for a mutating route: loads it, checks `board.manageCards`
 * and refuses an archived card with `404` (§8, AC 7). An archived card is
 * restored through FB-17 before it can be edited again.
 */
async function resolveCardForMutation(
  db: RouteDependencies['db'],
  cardId: string,
  userId: string,
): Promise<{ readonly access: CardAccess } | { readonly status: 403 | 404 }> {
  const access = await findCardAccess(db, cardId, userId);

  if (!boardIsVisible(userId, access)) return { status: 404 };

  if (!can({ userId }, 'board.manageCards', access)) return { status: 403 };

  if (access.card.archivedAt !== null) return { status: 404 };

  return { access };
}

/** The `422` message for each way a move destination can be wrong (CL-E41). */
const MOVE_REJECTIONS: Readonly<Record<MoveRejection, string>> = {
  list_not_found: 'listId is not a list on this board',
  cross_board: 'listId is not a list on this board',
  list_archived: 'That list is archived; restore it before moving a card into it',
};

export function cardRoutes(dependencies: RouteDependencies): FastifyPluginAsyncZod {
  const { db } = dependencies;

  return async (app) => {
    app.post(
      '/lists/:id/cards',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'createCard',
          summary: 'Add a card at the bottom of a list',
          description:
            'Appends a card at `positionAtEnd(max live position)`, writes `card.created { title }` and the `card.created` funnel event (CL-E40). Needs `board.manageCards`: workspace admin, board admin or board member.',
          tags: ['cards'],
          params: listIdParamsSchema,
          body: cardCreateSchema,
          response: { 201: cardSummarySchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined)
          throw new Error('POST /lists/:id/cards reached without requireAuth');

        const access = await findListAccess(db, request.params.id, user.id);

        if (
          access === null ||
          !access.visible ||
          !can({ userId: user.id }, 'board.view', access) ||
          (access.board.archivedAt !== null && !can({ userId: user.id }, 'board.manage', access))
        ) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'List not found'));
        }

        if (!can({ userId: user.id }, 'board.manageCards', access)) {
          return reply.code(403).send(forbidden());
        }

        // AC 1: an archived list takes no new cards, and is a 404 rather than a
        // 422 — unlike a board, a list has no "restore me first" route a client
        // could act on until FB-17.
        if (access.list.archivedAt !== null) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'List not found'));
        }

        const card = await createCard(db, access.list.id, {
          title: request.body.title,
          createdBy: user.id,
          workspaceId: access.board.workspaceId,
          boardId: access.board.id,
        });

        const summary = await findCardSummary(db, card.id);
        if (summary === null) throw new Error('createCard: the new card could not be read back');

        const body: CardSummary = presentCardSummary(summary);

        return reply.code(201).send(body);
      },
    );

    app.get(
      '/cards/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'getCard',
          summary: 'A card with its description, checklist and counts',
          description:
            'The lazy detail read behind the card modal (CL-E26, CL-E38). Every board role including Observer may read it. An archived card is visible only to a board admin or a workspace admin (AC 2).',
          tags: ['cards'],
          params: cardIdParamsSchema,
          response: { 200: cardDetailSchema, 401: apiErrorSchema, 404: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('GET /cards/:id reached without requireAuth');

        const resolved = await resolveCardForRead(db, request.params.id, user.id);

        if ('status' in resolved) return reply.code(404).send(cardNotFound());

        const detail = await findCardDetail(db, resolved.access.card.id);

        if (detail === null) return reply.code(404).send(cardNotFound());

        const body: CardDetail = presentCardDetail(detail);

        return reply.code(200).send(body);
      },
    );

    app.patch(
      '/cards/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'patchCard',
          summary: 'Rename a card, write its description, or move it',
          description:
            'At least one of `title`, `description`, `position`. `description: null` or an empty string clears it; the text is stored exactly as written and never rendered server-side (CL-D17). `listId` requires `position` and must be a live list on the same board (CL-E41). `If-Match` carries the last seen `updatedAt` and yields 409 when stale (CL-E23).',
          tags: ['cards'],
          params: cardIdParamsSchema,
          body: cardPatchSchema,
          response: { 200: cardSummarySchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('PATCH /cards/:id reached without requireAuth');

        const resolved = await resolveCardForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(forbidden())
            : reply.code(404).send(cardNotFound());
        }

        // CL-E23, as CL-E18 on boards: the header is optional in MVP-2, so a
        // client that never saw an `updatedAt` still succeeds. A move is an
        // edit, so it is checked here too.
        if (ifMatchIsStale(request.headers['if-match'], resolved.access.card.updatedAt)) {
          return reply
            .code(409)
            .send(error(API_ERROR_CODES.stale, 'This card was changed elsewhere; re-fetch it'));
        }

        const { title, description, listId, position, via } = request.body;

        const result = await updateCard(db, resolved.access, user.id, {
          title,
          description,
          listId,
          position,
          via,
        });

        if (result.outcome === 'gone') return reply.code(404).send(cardNotFound());

        if (result.outcome === 'rejected') {
          return reply
            .code(422)
            .send(error(API_ERROR_CODES.validationFailed, MOVE_REJECTIONS[result.reason]));
        }

        const summary = await findCardSummary(db, result.card.id);
        if (summary === null) return reply.code(404).send(cardNotFound());

        const body: CardSummary = presentCardSummary(summary);

        return reply.code(200).send(body);
      },
    );

    app.delete(
      '/cards/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'deleteCard',
          summary: 'Archive a card',
          description:
            'Soft delete (CL-A2): sets `archived_at`, writes `card.archived { via: "card" }` and removes the card from hydration. Restorable for 30 days (FB-17). A second call is a 404.',
          tags: ['cards'],
          params: cardIdParamsSchema,
          response: { 204: z.null(), ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('DELETE /cards/:id reached without requireAuth');

        const resolved = await resolveCardForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(forbidden())
            : reply.code(404).send(cardNotFound());
        }

        if (ifMatchIsStale(request.headers['if-match'], resolved.access.card.updatedAt)) {
          return reply
            .code(409)
            .send(error(API_ERROR_CODES.stale, 'This card was changed elsewhere; re-fetch it'));
        }

        const archived = await archiveCard(db, resolved.access.card.id, user.id);

        // Lost a race with another delete; the second one is a 404 (AC 7).
        if (archived === null) return reply.code(404).send(cardNotFound());

        return reply.code(204).send(null);
      },
    );

    app.post(
      '/cards/:id/copy',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'copyCard',
          summary: 'Copy a card directly below the original',
          description:
            'Copies the title (fitted with " (copy)"), description, due date and completion, labels, members and checklist items; not comments or activity (CL-A13). The caller is the copy’s `createdBy`, and its only activity row is one `card.created { title, copiedFromCardId }` (CL-E39).',
          tags: ['cards'],
          params: cardIdParamsSchema,
          response: { 201: cardSummarySchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('POST /cards/:id/copy reached without requireAuth');

        const resolved = await resolveCardForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(forbidden())
            : reply.code(404).send(cardNotFound());
        }

        const copy = await copyCard(db, resolved.access.card, user.id);

        const summary = await findCardSummary(db, copy.id);
        if (summary === null) throw new Error('copyCard: the new card could not be read back');

        const body: CardSummary = presentCardSummary(summary);

        return reply.code(201).send(body);
      },
    );

    app.get(
      '/cards/:id/activity',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'listCardActivity',
          summary: 'A card’s activity, newest first',
          description:
            'Cursor-paginated on `(createdAt, id)` (CL-E38), default 50 and maximum 200 per page. Each item carries its actor as a `PublicUser`. Every role that can view the board may read it.',
          tags: ['cards'],
          params: cardIdParamsSchema,
          querystring: activityQuerySchema,
          response: {
            200: activityPageSchema,
            401: apiErrorSchema,
            404: apiErrorSchema,
            422: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) {
          throw new Error('GET /cards/:id/activity reached without requireAuth');
        }

        const resolved = await resolveCardForRead(db, request.params.id, user.id);

        if ('status' in resolved) return reply.code(404).send(cardNotFound());

        const { cursor, limit } = request.query;

        let page;
        try {
          page = await listCardActivity(db, resolved.access.card.id, {
            limit,
            ...(cursor === undefined ? {} : { cursor }),
          });
        } catch (caught) {
          if (caught instanceof InvalidActivityCursorError) {
            return reply
              .code(422)
              .send(error(API_ERROR_CODES.validationFailed, 'The cursor is not valid'));
          }

          throw caught;
        }

        const body: ActivityPage = {
          items: page.items.map(presentActivityEvent),
          nextCursor: page.nextCursor,
        };

        return reply.code(200).send(body);
      },
    );
  };
}
