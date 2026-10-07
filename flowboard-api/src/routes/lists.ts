import {
  API_ERROR_CODES,
  apiErrorSchema,
  listArchiveCardsResultSchema,
  listCreateSchema,
  listIdParamsSchema,
  listPatchSchema,
  listSortByDueResultSchema,
  listSchema,
  type List,
} from '@flowboard/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { can } from '../authz/can.js';
import { findBoardAccess, type BoardAccess } from '../repositories/board.js';
import {
  archiveListCards,
  createList,
  deleteList,
  findListAccess,
  sortListByDue,
  updateList,
  type ListAccess,
} from '../repositories/list.js';
import { presentList } from './presenters.js';
import { ifMatchIsStale } from './boards.js';
import type { RouteDependencies } from './dependencies.js';

/**
 * The FB-05 list routes (§6): create, patch, delete, archive-cards and
 * sort-by-due.
 *
 * Every authorisation decision goes through `can()` with `board.manageLists`
 * resolved from the list's own board, never from the request (STANDARDS §1.4).
 * The two outcomes stay distinct, as on boards (FB-04 §8): a caller who cannot
 * *see* the board gets `404`, a caller who can see it but not change it gets
 * `403`. That is what makes the Observer row of §8 a `403` and the
 * off-board rows a `404`.
 */

const boardParamsSchema = z.object({ id: z.uuid() }).describe('BoardIdParams');

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
function listNotFound(): ReturnType<typeof error> {
  return error(API_ERROR_CODES.notFound, 'List not found');
}

/**
 * Whether `access` lets the caller manage lists on the board, split into the
 * three answers the routes need: not visible (`404`), visible but not
 * permitted (`403`), or allowed.
 */
type Permission = { readonly outcome: 'ok' } | { readonly outcome: 'not_found' | 'forbidden' };

function mayManageLists(userId: string, access: BoardAccess | null): Permission {
  if (access === null || !access.visible || !can({ userId }, 'board.view', access)) {
    return { outcome: 'not_found' };
  }

  // CL-E16: an archived board is invisible to everyone who cannot restore it,
  // so its lists are too.
  if (access.board.archivedAt !== null && !can({ userId }, 'board.manage', access)) {
    return { outcome: 'not_found' };
  }

  if (!can({ userId }, 'board.manageLists', access)) {
    return { outcome: 'forbidden' };
  }

  return { outcome: 'ok' };
}

/**
 * Resolves a list for a mutating route: loads it, checks the capability and
 * refuses an archived list with `404` (FB-05 §6, AC 9).
 *
 * Returns the access on success, or the reply status the route should send.
 */
async function resolveListForMutation(
  db: RouteDependencies['db'],
  listId: string,
  userId: string,
): Promise<{ readonly access: ListAccess } | { readonly status: 403 | 404 }> {
  const access = await findListAccess(db, listId, userId);

  const permission = mayManageLists(userId, access);

  if (permission.outcome === 'not_found') return { status: 404 };
  if (permission.outcome === 'forbidden') return { status: 403 };
  if (access === null) return { status: 404 };

  // An archived list has no routes (FB-05 §6): it is restored through FB-17
  // first. `404` rather than `410`, matching the archived-board behaviour.
  if (access.list.archivedAt !== null) return { status: 404 };

  return { access };
}

export function listRoutes(dependencies: RouteDependencies): FastifyPluginAsyncZod {
  const { db } = dependencies;

  return async (app) => {
    app.post(
      '/boards/:id/lists',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'createList',
          summary: 'Add a list at the right end of a board',
          description:
            'Appends a list at `positionAtEnd(max position)` with no WIP limit (L-01, CL-E33). Needs `board.manageLists`: workspace admin, board admin or board member.',
          tags: ['lists'],
          params: boardParamsSchema,
          body: listCreateSchema,
          response: { 201: listSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined)
          throw new Error('POST /boards/:id/lists reached without requireAuth');

        const access = await findBoardAccess(db, request.params.id, user.id);

        if (access === null || !access.visible || !can({ userId: user.id }, 'board.view', access)) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        if (!can({ userId: user.id }, 'board.manageLists', access)) {
          return reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'));
        }

        // AC 9: an archived board takes no new lists. A member cannot see it at
        // all (404); an admin can, and is told to restore it first (422), which
        // is the actionable answer rather than a flat refusal.
        if (access.board.archivedAt !== null) {
          if (!can({ userId: user.id }, 'board.manage', access)) {
            return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
          }

          return reply
            .code(422)
            .send(
              error(
                API_ERROR_CODES.validationFailed,
                'This board is archived; restore it before adding a list',
              ),
            );
        }

        const list = await createList(db, access.board.id, { name: request.body.name });

        const body: List = presentList(list);

        return reply.code(201).send(body);
      },
    );

    app.patch(
      '/lists/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'patchList',
          summary: 'Rename, reposition or set the WIP limit of a list',
          description:
            'At least one of `name`, `position`, `wipLimit`. `wipLimit: null` clears the limit; limits are advisory and never reject a move (CL-D4). `If-Match` carries the last seen `updatedAt` and yields 409 when stale (CL-E23).',
          tags: ['lists'],
          params: listIdParamsSchema,
          body: listPatchSchema,
          response: { 200: listSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('PATCH /lists/:id reached without requireAuth');

        const resolved = await resolveListForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'))
            : reply.code(404).send(listNotFound());
        }

        // CL-E23, as CL-E18 on boards: the header is optional in MVP-2, so a
        // client that never saw an `updatedAt` still succeeds.
        if (ifMatchIsStale(request.headers['if-match'], resolved.access.list.updatedAt)) {
          return reply
            .code(409)
            .send(error(API_ERROR_CODES.stale, 'This list was changed elsewhere; re-fetch it'));
        }

        const { name, position, wipLimit } = request.body;

        const list = await updateList(db, resolved.access.list.id, { name, position, wipLimit });

        if (list === null) return reply.code(404).send(listNotFound());

        const body: List = presentList(list);

        return reply.code(200).send(body);
      },
    );

    app.delete(
      '/lists/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'deleteList',
          summary: 'Archive a list and the cards on it',
          description:
            'Soft delete (CL-A2): the list and each of its live cards are archived with one shared timestamp and one `card.archived { via: "list_archived" }` per card, in one transaction (CL-E2, CL-E34). Restorable for 30 days (FB-17).',
          tags: ['lists'],
          params: listIdParamsSchema,
          response: { 204: z.null(), ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('DELETE /lists/:id reached without requireAuth');

        const resolved = await resolveListForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'))
            : reply.code(404).send(listNotFound());
        }

        if (ifMatchIsStale(request.headers['if-match'], resolved.access.list.updatedAt)) {
          return reply
            .code(409)
            .send(error(API_ERROR_CODES.stale, 'This list was changed elsewhere; re-fetch it'));
        }

        const deleted = await deleteList(db, resolved.access.list.id, user.id);

        // Lost a race with another delete; the second one is a 404 (AC 7).
        if (deleted === null) return reply.code(404).send(listNotFound());

        return reply.code(204).send(null);
      },
    );

    app.post(
      '/lists/:id/archive-cards',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'archiveListCards',
          summary: 'Archive every card in a list, keeping the list',
          description:
            'Archives the list’s live cards with one `card.archived { via: "archive_all" }` per card, in one transaction (CL-E24, CL-E34). The list itself stays on the board.',
          tags: ['lists'],
          params: listIdParamsSchema,
          response: { 200: listArchiveCardsResultSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) {
          throw new Error('POST /lists/:id/archive-cards reached without requireAuth');
        }

        const resolved = await resolveListForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'))
            : reply.code(404).send(listNotFound());
        }

        const archivedCardIds = await archiveListCards(db, resolved.access.list.id, user.id);

        return reply.code(200).send({ archivedCardIds });
      },
    );

    app.post(
      '/lists/:id/sort-by-due',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'sortListByDue',
          summary: 'Reorder a list’s cards by due date',
          description:
            'A one-off rewrite of positions (CL-A14): stable ascending by due date, undated cards last, positions re-balanced, and one `card.moved { via: "sort" }` for each card whose rank changed. Calling it again on a sorted list changes nothing.',
          tags: ['lists'],
          params: listIdParamsSchema,
          response: { 200: listSortByDueResultSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) {
          throw new Error('POST /lists/:id/sort-by-due reached without requireAuth');
        }

        const resolved = await resolveListForMutation(db, request.params.id, user.id);

        if ('status' in resolved) {
          return resolved.status === 403
            ? reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'))
            : reply.code(404).send(listNotFound());
        }

        const movedCardIds = await sortListByDue(db, resolved.access.list.id, user.id);

        return reply.code(200).send({ movedCardIds });
      },
    );
  };
}
