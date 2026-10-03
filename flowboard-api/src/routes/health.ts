import { healthResponseSchema } from '@flowboard/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { API_PACKAGE_VERSION } from '../version.js';

/** `GET /v1/health` — unauthenticated liveness probe (FB-00 §6). */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        operationId: 'getHealth',
        summary: 'Service health',
        description: 'Returns the service status and the running API package version.',
        tags: ['system'],
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => ({ status: 'ok' as const, version: API_PACKAGE_VERSION }),
  );
};
