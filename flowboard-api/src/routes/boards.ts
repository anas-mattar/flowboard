import {
  API_ERROR_CODES,
  apiErrorSchema,
  boardCreateSchema,
  boardHydratedSchema,
  boardListQuerySchema,
  boardListSchema,
  boardPatchSchema,
  boardSummarySchema,
  type BoardCallerRole,
  type BoardHydrated,
  type BoardSummary,
} from '@flowboard/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { can } from '../authz/can.js';
import { InvalidCursorError } from '../boards/ordering.js';
import { findMemberships } from '../repositories/account.js';
import {
  countBoardCards,
  createBoard,
  findBoardAccess,
  findWorkspaceRole,
  hydrateBoard,
  isStarred,
  listBoards,
  setBoardStar,
  updateBoard,
  type BoardAccess,
} from '../repositories/board.js';
import { presentBoardSummary, presentHydratedBoard } from './presenters.js';
import type { RouteDependencies } from './dependencies.js';

/**
 * `GET /v1/boards`, `POST /v1/boards`, `GET /v1/boards/{id}` and
 * `PATCH /v1/boards/{id}` (FB-04 §6).
 *
 * Every authorisation decision goes through `can()` with the roles resolved
 * from the database, never from the request (STANDARDS §1.4). The two outcomes
 * are deliberately different: a caller who cannot *see* a board gets `404`, a
 * caller who can see it but not change it gets `403` (FB-04 §8).
 */

const boardParamsSchema = z.object({ id: z.uuid() }).describe('BoardParams');

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

/**
 * What the caller may do here, for the UI to hide what it should
 * (FB-04 §6 `callerRole`). A board member's own role wins over the workspace
 * role, so a workspace admin who is also a board observer is reported as the
 * board role they actually hold.
 */
function callerRole(access: BoardAccess): BoardCallerRole {
  return access.boardRole ?? 'workspace_admin';
}

/**
 * `If-Match` carries the `updatedAt` the client last saw (CL-E18). The header
 * is compared against the ISO 8601 rendering the client was given rather than
 * against the `Date`, so a value that round-tripped through JSON matches
 * exactly. Quotes are tolerated because an HTTP client may add ETag quoting.
 */
export function ifMatchIsStale(header: string | undefined, updatedAt: Date): boolean {
  if (header === undefined) return false;

  const candidate = header.trim().replace(/^W\//, '').replace(/^"|"$/g, '');

  return candidate !== updatedAt.toISOString();
}

export function boardRoutes(dependencies: RouteDependencies): FastifyPluginAsyncZod {
  const { db } = dependencies;

  return async (app) => {
    app.get(
      '/boards',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'listBoards',
          summary: 'The caller’s boards, starred first then by name',
          description:
            'Non-archived boards the caller may view (CL-E17), cursor-paginated. `cardCount` counts non-archived cards on non-archived lists.',
          tags: ['boards'],
          querystring: boardListQuerySchema,
          response: { 200: boardListSchema, 401: apiErrorSchema, 422: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('GET /boards reached without requireAuth');

        const { cursor, limit } = request.query;

        let page;
        try {
          page = await listBoards(db, user.id, {
            limit,
            ...(cursor === undefined ? {} : { cursor }),
          });
        } catch (caught) {
          if (caught instanceof InvalidCursorError) {
            return reply
              .code(422)
              .send(error(API_ERROR_CODES.validationFailed, 'The cursor is not valid'));
          }

          throw caught;
        }

        return reply.code(200).send({
          items: page.items.map((row) =>
            presentBoardSummary(row.board, row.starred, row.cardCount),
          ),
          nextCursor: page.nextCursor,
        });
      },
    );

    app.post(
      '/boards',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'createBoard',
          summary: 'Create a board with its default lists and labels',
          description:
            'Creates the board, the creator as board admin, three default lists (CL-A7), six default labels (CL-D3) and the `board.created` funnel event (CL-E20), in one transaction.',
          tags: ['boards'],
          body: boardCreateSchema,
          response: {
            201: boardHydratedSchema,
            401: apiErrorSchema,
            403: apiErrorSchema,
            422: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('POST /boards reached without requireAuth');

        const { name } = request.body;

        // CL-D7: default to the caller's current workspace, which is the
        // earliest-joined one, exactly as `GET /v1/me` reports it.
        let workspaceId = request.body.workspaceId;

        if (workspaceId === undefined) {
          const memberships = await findMemberships(db, user.id);
          const current = memberships[0];

          if (current === undefined) {
            request.log.error({ userId: user.id }, 'user has no workspace membership');
            throw new Error('POST /boards: the caller has no workspace membership');
          }

          workspaceId = current.workspace.id;
        }

        const workspaceRole = await findWorkspaceRole(db, workspaceId, user.id);

        // FB-04 §8: a workspace the caller has not joined is a 422, not a 403
        // and not a 404, so the endpoint never confirms the id exists.
        if (workspaceRole === null) {
          return reply
            .code(422)
            .send(
              error(
                API_ERROR_CODES.validationFailed,
                'workspaceId is not a workspace you belong to',
              ),
            );
        }

        // FS §6: board creation is a workspace-member capability.
        if (!can({ userId: user.id }, 'board.create', { workspaceRole })) {
          return reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'));
        }

        const created = await createBoard(db, { name, workspaceId, createdBy: user.id });
        const hydrated = await hydrateBoard(db, created.board.id);

        const body: BoardHydrated = presentHydratedBoard(created.board, hydrated, {
          // A board the caller just created is not starred, and they are its admin.
          starred: false,
          callerRole: 'admin',
        });

        return reply.code(201).send(body);
      },
    );

    app.get(
      '/boards/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'getBoard',
          summary: 'A board with its members, labels, lists and cards',
          description:
            'The single hydration call of FS §7. An archived board is visible only to a board admin or a workspace admin (CL-E16).',
          tags: ['boards'],
          params: boardParamsSchema,
          response: { 200: boardHydratedSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('GET /boards/:id reached without requireAuth');

        const access = await findBoardAccess(db, request.params.id, user.id);

        if (access === null || !access.visible) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        if (!can({ userId: user.id }, 'board.view', access)) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        // CL-E16: an archived board stays readable for the roles that can
        // restore it (FB-17), and is simply absent for everyone else.
        if (access.board.archivedAt !== null && !can({ userId: user.id }, 'board.manage', access)) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        const [hydrated, starred] = await Promise.all([
          hydrateBoard(db, access.board.id),
          isStarred(db, access.board.id, user.id),
        ]);

        return reply.code(200).send(
          presentHydratedBoard(access.board, hydrated, {
            starred,
            callerRole: callerRole(access),
          }),
        );
      },
    );

    app.patch(
      '/boards/:id',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'patchBoard',
          summary: 'Rename, recolour, star or archive a board',
          description:
            'Name, colour and archive need board admin or workspace admin; starring is allowed for anyone who can view the board (CL-E14). `If-Match` carries the last seen `updatedAt` and yields 409 when stale (CL-E18).',
          tags: ['boards'],
          params: boardParamsSchema,
          body: boardPatchSchema,
          response: { 200: boardSummarySchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('PATCH /boards/:id reached without requireAuth');

        const access = await findBoardAccess(db, request.params.id, user.id);

        if (access === null || !access.visible || !can({ userId: user.id }, 'board.view', access)) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        const principal = { userId: user.id };
        const isBoardManager = can(principal, 'board.manage', access);

        // An archived board is invisible to everyone who cannot restore it,
        // on PATCH as much as on GET (CL-E16).
        if (access.board.archivedAt !== null && !isBoardManager) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        const { name, color, archived, starred } = request.body;
        const editsBoard = name !== undefined || color !== undefined || archived !== undefined;

        // FS §6: rename, recolour and archive are admin capabilities; a board
        // member or observer gets 403, not a silent partial apply.
        if (editsBoard && !isBoardManager) {
          return reply.code(403).send(error(API_ERROR_CODES.forbidden, 'Not permitted'));
        }

        // CL-E18. Checked only for a board edit: §6 records that `starred`
        // does not move `updatedAt`, so `If-Match` is ignored when starring is
        // the only field — otherwise a star would fail against a token the
        // star itself can never change.
        if (editsBoard && ifMatchIsStale(request.headers['if-match'], access.board.updatedAt)) {
          return reply
            .code(409)
            .send(error(API_ERROR_CODES.stale, 'This board was changed elsewhere; re-fetch it'));
        }

        if (starred !== undefined) {
          // CL-E14: any role that can view the board may star it, observers
          // included, so this sits outside the `board.manage` check above.
          await setBoardStar(db, access.board.id, user.id, starred);
        }

        const board = editsBoard
          ? await updateBoard(db, access.board.id, { name, color, archived })
          : access.board;

        if (board === null) {
          return reply.code(404).send(error(API_ERROR_CODES.notFound, 'Board not found'));
        }

        const [nowStarred, cardCount] = await Promise.all([
          starred === undefined ? isStarred(db, board.id, user.id) : Promise.resolve(starred),
          countBoardCards(db, board.id),
        ]);

        const body: BoardSummary = presentBoardSummary(board, nowStarred, cardCount);

        return reply.code(200).send(body);
      },
    );
  };
}
