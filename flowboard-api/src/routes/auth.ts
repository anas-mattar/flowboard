import {
  apiErrorSchema,
  authResponseSchema,
  loginRequestSchema,
  signupRequestSchema,
  API_ERROR_CODES,
  type AuthResponse,
} from '@flowboard/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionCookieSecure } from '../config/env.js';
import { LOGIN_EMAIL_RULE, LOGIN_IP_RULE, SIGNUP_IP_RULE } from '../config/rate-limits.js';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth/cookie.js';
import { rateLimitKey, type RateLimiter } from '../auth/rate-limit.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/password.js';
import type { RateLimitRule } from '../config/rate-limits.js';
import {
  createAccount,
  EmailTakenError,
  findMemberships,
  findUserByEmail,
} from '../repositories/account.js';
import { createSession, deleteSession, type IssuedSession } from '../repositories/session.js';
import { presentUser, presentWorkspace } from './presenters.js';
import type { RouteDependencies } from './dependencies.js';

/**
 * `POST /v1/auth/signup`, `/login` and `/logout` (FB-02 §6).
 *
 * The three rules that hold across all of them: a failed login never reveals
 * whether the email exists (CL-E10), the session token reaches the client
 * either in the cookie or in the body but never both (CL-E9), and the token
 * is never written to a log line.
 */

/** The shape of a `429`, shared by the signup and login limiters (CL-E11). */
function rateLimited(reply: FastifyReply, retryAfterSeconds: number): FastifyReply {
  return reply
    .code(429)
    .header('retry-after', String(retryAfterSeconds))
    .send({
      error: {
        code: API_ERROR_CODES.rateLimited,
        message: 'Too many attempts. Try again later.',
        details: { retryAfterSeconds },
      },
    });
}

/**
 * Counts the request against `rule`. Returns `true` when the caller has been
 * answered with a `429` and the handler must stop.
 */
function throttled(
  limiter: RateLimiter,
  reply: FastifyReply,
  rule: RateLimitRule,
  key: string,
): boolean {
  const decision = limiter.consume(rule, key);

  if (decision.allowed) return false;

  rateLimited(reply, decision.retryAfterSeconds);
  return true;
}

/**
 * Puts the issued token where the caller asked for it: the body when
 * `tokenResponse: true`, otherwise the cookie and nowhere else (AC 5).
 */
function deliverSession(
  reply: FastifyReply,
  session: IssuedSession,
  tokenResponse: boolean,
  secure: boolean,
  body: Omit<AuthResponse, 'sessionToken'>,
): AuthResponse {
  if (tokenResponse) return { ...body, sessionToken: session.token };

  void reply.setCookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(secure));
  return body;
}

/** The client address the limiter counts against; `trustProxy` is on in `app.ts`. */
function clientIp(request: FastifyRequest): string {
  return request.ip;
}

export function authRoutes(dependencies: RouteDependencies): FastifyPluginAsyncZod {
  const { db, env, rateLimiter } = dependencies;
  const secure = sessionCookieSecure(env);

  return async (app) => {
    app.post(
      '/auth/signup',
      {
        schema: {
          operationId: 'signup',
          summary: 'Create an account and its workspace',
          description:
            'Creates the user, a workspace named "<display name>\'s workspace" with the creator as admin, and a session, in one transaction (CL-E12).',
          tags: ['auth'],
          body: signupRequestSchema,
          response: {
            201: authResponseSchema,
            409: apiErrorSchema,
            422: apiErrorSchema,
            429: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        if (
          throttled(
            rateLimiter,
            reply,
            SIGNUP_IP_RULE,
            rateLimitKey('signup:ip', clientIp(request)),
          )
        ) {
          return reply;
        }

        const { email, password, displayName, tokenResponse = false } = request.body;

        const passwordHash = await hashPassword(password);

        try {
          const result = await createAccount(db, {
            email,
            passwordHash,
            displayName,
            session: { userAgent: request.headers['user-agent'], ip: clientIp(request) },
          });

          request.log.info(
            { userId: result.user.id, workspaceId: result.workspace.id },
            'account created',
          );

          const body = deliverSession(reply, result.session, tokenResponse, secure, {
            user: presentUser(result.user),
            workspace: presentWorkspace(result.workspace),
          });

          return reply.code(201).send(body);
        } catch (error) {
          if (error instanceof EmailTakenError) {
            // Signup is the one place the product has to say an address is
            // taken; CL-E10's "never reveal" rule is about *login*.
            return reply.code(409).send({
              error: {
                code: API_ERROR_CODES.emailTaken,
                message: 'That email address is already registered',
              },
            });
          }

          throw error;
        }
      },
    );

    app.post(
      '/auth/login',
      {
        schema: {
          operationId: 'login',
          summary: 'Sign in with an email and password',
          tags: ['auth'],
          body: loginRequestSchema,
          response: {
            200: authResponseSchema,
            401: apiErrorSchema,
            422: apiErrorSchema,
            429: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const { email, password, tokenResponse = false } = request.body;

        if (
          throttled(rateLimiter, reply, LOGIN_IP_RULE, rateLimitKey('login:ip', clientIp(request)))
        ) {
          return reply;
        }

        if (throttled(rateLimiter, reply, LOGIN_EMAIL_RULE, rateLimitKey('login:email', email))) {
          return reply;
        }

        const user = await findUserByEmail(db, email);

        // An unknown email still costs one argon2id verification, so the two
        // failures take comparable time (AC 4).
        const ok =
          user === null
            ? await verifyAgainstDummy(password)
            : await verifyPassword(user.passwordHash, password);

        if (!ok || user === null) {
          request.log.info({ outcome: 'invalid_credentials' }, 'login rejected');

          return reply.code(401).send({
            error: {
              code: API_ERROR_CODES.invalidCredentials,
              message: 'Email or password is incorrect',
            },
          });
        }

        const memberships = await findMemberships(db, user.id);
        const current = memberships[0];

        if (current === undefined) {
          // Every user gets a workspace at signup (CL-E12), so this is a
          // broken row rather than a client error.
          request.log.error({ userId: user.id }, 'user has no workspace membership');
          throw new Error('login: the user has no workspace membership');
        }

        const session = await createSession(db, user.id, {
          userAgent: request.headers['user-agent'],
          ip: clientIp(request),
        });

        request.log.info({ userId: user.id }, 'login succeeded');

        const body = deliverSession(reply, session, tokenResponse, secure, {
          user: presentUser(user),
          workspace: presentWorkspace(current.workspace),
        });

        return reply.code(200).send(body);
      },
    );

    app.post(
      '/auth/logout',
      {
        preHandler: app.requireAuth,
        schema: {
          operationId: 'logout',
          summary: 'Delete the current session',
          tags: ['auth'],
          response: {
            204: z.null().describe('NoContent'),
            401: apiErrorSchema,
            403: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const session = request.session;

        if (session !== undefined) await deleteSession(db, session.id);

        void reply.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(secure));

        return reply.code(204).send(null);
      },
    );
  };
}
