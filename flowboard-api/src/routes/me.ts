import {
  apiErrorSchema,
  mePatchSchema,
  meResponseSchema,
  userSchema,
  API_ERROR_CODES,
} from '@flowboard/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { can } from '../authz/can.js';
import { findMemberships, updateUserTheme } from '../repositories/account.js';
import { presentUser, presentWorkspace } from './presenters.js';
import type { RouteDependencies } from './dependencies.js';

/**
 * `GET /v1/me` and `PATCH /v1/me` (FB-02 §6).
 *
 * There is no route anywhere in FB-02 that takes a user id, so a caller can
 * only ever read themselves (AC 16). `currentWorkspace` is the earliest-joined
 * workspace, which is the one the UI opens until a switcher exists (CL-D7).
 */
export function meRoutes(dependencies: RouteDependencies): FastifyPluginAsyncZod {
  const { db } = dependencies;

  return async (app) => {
    app.get(
      '/me',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'getMe',
          summary: 'The signed-in user, their workspaces and the current one',
          tags: ['me'],
          response: { 200: meResponseSchema, 401: apiErrorSchema, 403: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('GET /me reached without requireAuth');

        if (!can({ userId: user.id }, 'self.read')) {
          return reply
            .code(403)
            .send({ error: { code: API_ERROR_CODES.forbidden, message: 'Not permitted' } });
        }

        const memberships = await findMemberships(db, user.id);
        const current = memberships[0];

        if (current === undefined) {
          request.log.error({ userId: user.id }, 'user has no workspace membership');
          throw new Error('GET /me: the user has no workspace membership');
        }

        return reply.code(200).send({
          user: presentUser(user),
          workspaces: memberships.map((membership) => ({
            workspace: presentWorkspace(membership.workspace),
            role: membership.role,
          })),
          currentWorkspace: presentWorkspace(current.workspace),
        });
      },
    );

    app.patch(
      '/me',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'patchMe',
          summary: 'Change the signed-in user’s theme',
          description:
            'Theme is the only self-service field in MVP (CL-E13). Any other key is rejected with 422.',
          tags: ['me'],
          body: mePatchSchema,
          response: {
            200: userSchema,
            401: apiErrorSchema,
            403: apiErrorSchema,
            422: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (user === undefined) throw new Error('PATCH /me reached without requireAuth');

        if (!can({ userId: user.id }, 'self.updateTheme')) {
          return reply
            .code(403)
            .send({ error: { code: API_ERROR_CODES.forbidden, message: 'Not permitted' } });
        }

        const updated = await updateUserTheme(db, user.id, request.body.theme);

        if (updated === null) {
          // The session resolved to this row moments ago, so a miss means the
          // account was deleted mid-request.
          return reply.code(401).send({
            error: { code: API_ERROR_CODES.unauthenticated, message: 'Authentication required' },
          });
        }

        return reply.code(200).send(presentUser(updated));
      },
    );
  };
}
