import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import { API_ERROR_CODES, API_VERSION, type ApiError } from '@flowboard/shared';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { auth } from './auth/plugin.js';
import { RateLimiter } from './auth/rate-limit.js';
import { corsOrigins, type Env } from './config/env.js';
import { createDatabase, type DatabaseHandle } from './db/client.js';
import { authRoutes } from './routes/auth.js';
import { boardRoutes } from './routes/boards.js';
import { cardRoutes } from './routes/cards.js';
import { healthRoutes } from './routes/health.js';
import { listRoutes } from './routes/lists.js';
import { meRoutes } from './routes/me.js';
import { API_PACKAGE_VERSION } from './version.js';

function envelope(code: string, message: string, details?: unknown): ApiError {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

export interface BuildAppOptions {
  /**
   * An already-open database handle. Integration tests pass the one they
   * migrated and truncate between files; when omitted, the app opens its own
   * from `DATABASE_URL` and closes it on shutdown.
   */
  readonly database?: DatabaseHandle;
  /**
   * The auth rate limiter (CL-E11). Tests pass their own so one file's
   * fixtures cannot throttle the next.
   */
  readonly rateLimiter?: RateLimiter;
  /**
   * Destination for the structured log. Only the log-scrubbing test in
   * `test/auth.signup.test.ts` passes one, so it can assert on the real pino
   * output rather than on a stub (FB-02 §4 item 2).
   */
  readonly loggerStream?: NodeJS.WritableStream;
}

/**
 * Builds the Fastify application without listening, so integration tests can
 * drive it with `app.inject()` (STANDARDS §4).
 */
export async function buildApp(env: Env, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // STANDARDS §1.5: structured JSON only, and never a credential in a log line.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        remove: true,
      },
      ...(options.loggerStream === undefined ? {} : { stream: options.loggerStream }),
    },
    // Honour an inbound request id so logs correlate across the web app and the API.
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      const candidate = Array.isArray(header) ? header[0] : header;
      return candidate && candidate.length <= 200 ? candidate : randomUUID();
    },
    // Request logging stays on: Fastify logs `incoming request` / `request
    // completed` by default. The `disableRequestLogging` option is deprecated in
    // Fastify 5 and removed in Fastify 6, so the default is relied on instead.
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  // Both handlers must be installed *before* the route plugins below. Fastify
  // copies the parent's error handler into a child encapsulation context when
  // that child is registered, so a handler set afterwards never reaches the
  // `/v1` routes and they fall back to Fastify's own error shape. FB-00 set
  // these at the end of this function, which FB-02's first route with a
  // request body exposed (every 422 came back as a bare Fastify 400).
  app.setNotFoundHandler(async (request, reply) => {
    await reply
      .code(404)
      .send(envelope(API_ERROR_CODES.notFound, `Route ${request.method} ${request.url} not found`));
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.info({ err: error }, 'request validation failed');
      return reply
        .code(422)
        .send(
          envelope(API_ERROR_CODES.validationFailed, 'Request validation failed', error.validation),
        );
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response serialization failed');
      return reply.code(500).send(envelope(API_ERROR_CODES.internalError, 'Internal server error'));
    }

    // The guards above narrow `error` to `unknown`; restore the Fastify shape.
    const fastifyError = error as FastifyError;
    const statusCode = fastifyError.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error({ err: fastifyError }, 'unhandled request error');
      return reply
        .code(statusCode)
        .send(envelope(API_ERROR_CODES.internalError, 'Internal server error'));
    }

    request.log.info({ err: fastifyError }, 'request rejected');
    return reply.code(statusCode).send(envelope(API_ERROR_CODES.badRequest, fastifyError.message));
  });

  // An externally supplied handle belongs to the caller; one we open here is
  // ours to close with the server.
  const ownsDatabase = options.database === undefined;
  const database = options.database ?? createDatabase(env.DATABASE_URL);
  const rateLimiter = options.rateLimiter ?? new RateLimiter({ disabled: env.RATE_LIMIT_DISABLED });

  if (ownsDatabase) {
    app.addHook('onClose', async () => {
      await database.close();
    });
  }

  await app.register(cors, {
    origin: corsOrigins(env),
    credentials: true,
  });

  // No `secret`: the session token is an opaque random value looked up in the
  // `session` table, so there is nothing to sign (CL-E9).
  await app.register(cookie);

  await app.register(auth, { env, db: database.db });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'FlowBoard API',
        description: 'FlowBoard REST API. FS §7 fixes the public surface at /v1.',
        version: API_PACKAGE_VERSION,
      },
      // Paths are recorded with their `/v1` prefix, so the server is the host root.
      servers: [{ url: '/', description: 'Service root' }],
      tags: [
        { name: 'system', description: 'Health and service metadata' },
        { name: 'auth', description: 'Signup, login and logout (FB-02)' },
        { name: 'me', description: 'The signed-in user (FB-02)' },
        { name: 'boards', description: 'Boards, their lists and cards (FB-04)' },
        { name: 'lists', description: 'Lists on a board: order, WIP limit, archive (FB-05)' },
        {
          name: 'cards',
          description: 'Cards: create, detail, title and description, move, copy, activity (FB-06)',
        },
      ],
    },
    transform: jsonSchemaTransform,
  });

  const dependencies = { db: database.db, env, rateLimiter };

  await app.register(
    async (versioned) => {
      await versioned.register(healthRoutes);
      await versioned.register(authRoutes(dependencies));
      await versioned.register(meRoutes(dependencies));
      await versioned.register(boardRoutes(dependencies));
      await versioned.register(listRoutes(dependencies));
      await versioned.register(cardRoutes(dependencies));
    },
    { prefix: `/${API_VERSION}` },
  );

  app.get(`/${API_VERSION}/openapi.json`, { schema: { hide: true } }, async () => app.swagger());

  await app.ready();
  return app;
}
